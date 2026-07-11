const SIZE: usize = 15;
const CELLS: usize = SIZE * SIZE;
const EMPTY: u8 = 0;
const BLACK: u8 = 1;
const WHITE: u8 = 2;
const WIN: i32 = 1_000_000_000;
const INF: i32 = 1_100_000_000;
const NO_MOVE: u16 = u16::MAX;
const LINE_COUNT: usize = 88;
const TABLE_SIZE: usize = 1 << 17;
const MATE_SCORE_THRESHOLD: i32 = WIN - 256;
const DIRECTIONS: [(i8, i8); 4] = [(0, 1), (1, 0), (1, 1), (1, -1)];
const CAPTURE_DIRECTIONS: [(i8, i8); 8] = [
    (0, 1),
    (1, 0),
    (1, 1),
    (1, -1),
    (0, -1),
    (-1, 0),
    (-1, -1),
    (-1, 1),
];

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn now_ms() -> f64;
}

#[cfg(target_arch = "wasm32")]
fn clock_ms() -> f64 {
    unsafe { now_ms() }
}

#[cfg(not(target_arch = "wasm32"))]
fn clock_ms() -> f64 {
    use std::sync::OnceLock;
    use std::time::Instant;

    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_secs_f64() * 1_000.0
}

#[derive(Clone, Copy, Default)]
struct BitSet([u64; 4]);

impl BitSet {
    fn contains(self, position: usize) -> bool {
        self.0[position / 64] & (1_u64 << (position % 64)) != 0
    }

    fn insert(&mut self, position: usize) {
        self.0[position / 64] |= 1_u64 << (position % 64);
    }

    fn is_empty(self) -> bool {
        self.0.iter().all(|part| *part == 0)
    }

    fn positions(self) -> BitPositions {
        BitPositions {
            parts: self.0,
            part: 0,
        }
    }
}

struct BitPositions {
    parts: [u64; 4],
    part: usize,
}

impl Iterator for BitPositions {
    type Item = usize;

    fn next(&mut self) -> Option<Self::Item> {
        while self.part < self.parts.len() {
            let bits = self.parts[self.part];
            if bits != 0 {
                let offset = bits.trailing_zeros() as usize;
                self.parts[self.part] &= bits - 1;
                return Some(self.part * 64 + offset);
            }
            self.part += 1;
        }
        None
    }
}

#[derive(Clone, Copy)]
struct Position {
    board: [u8; CELLS],
    blocked: BitSet,
    candidates: BitSet,
    turn: u8,
    hash: u64,
    occupied: u16,
}

#[derive(Clone, Copy)]
struct Profile {
    max_depth: u8,
    candidate_limit: usize,
    forcing_depth: u8,
    include_open_threes: bool,
}

impl Profile {
    fn for_difficulty(difficulty: u8, max_depth: u8) -> Self {
        let mut profile = match difficulty {
            2 => Self {
                max_depth: 14,
                candidate_limit: 18,
                forcing_depth: 4,
                include_open_threes: true,
            },
            1 => Self {
                max_depth: 12,
                candidate_limit: 18,
                forcing_depth: 7,
                include_open_threes: false,
            },
            _ => Self {
                max_depth: 8,
                candidate_limit: 14,
                forcing_depth: 4,
                include_open_threes: false,
            },
        };
        if max_depth > 0 {
            profile.max_depth = max_depth;
        }
        profile
    }
}

#[derive(Clone, Copy, Default)]
struct TableEntry {
    depth: u8,
    score: i32,
    flag: u8,
    best_move: u16,
}

#[derive(Clone, Copy, Default)]
struct TableSlot {
    key: u64,
    entry: TableEntry,
}

struct Search {
    deadline: f64,
    nodes: u32,
    profile: Profile,
    table: Vec<TableSlot>,
    killers: [[u16; 2]; 64],
    history: [[i32; CELLS]; 2],
    timed_out: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub struct SearchResult {
    pub position: Option<u16>,
    pub depth: u8,
    pub nodes: u32,
}

#[derive(Clone, Copy)]
struct ScoredMove {
    position: u16,
    score: i32,
}

#[derive(Clone, Copy, Default)]
struct Threat {
    immediate_win: bool,
    fours: u8,
    open_threes: u8,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ForcingKind {
    None,
    Win,
    Defense,
    Attack,
}

struct ForcingLine {
    moves: Vec<ScoredMove>,
    kind: ForcingKind,
}

impl Search {
    fn new(time_budget_ms: u32, profile: Profile) -> Self {
        Self {
            deadline: clock_ms() + f64::from(time_budget_ms.max(1)),
            nodes: 0,
            profile,
            table: vec![TableSlot::default(); TABLE_SIZE],
            killers: [[NO_MOVE; 2]; 64],
            history: [[0; CELLS]; 2],
            timed_out: false,
        }
    }

    fn expired(&mut self) -> bool {
        if self.timed_out {
            return true;
        }
        if self.nodes & 63 == 0 && clock_ms() >= self.deadline {
            self.timed_out = true;
        }
        self.timed_out
    }

    fn root(
        &mut self,
        position: &Position,
        root_moves: &[ScoredMove],
        previous_best: u16,
        depth: u8,
    ) -> (u16, i32) {
        let mut moves = root_moves.to_vec();
        self.order_moves(position, &mut moves, previous_best, 0);
        moves.truncate(self.profile.candidate_limit.max(16));

        let mut best_move = moves.first().map_or(previous_best, |item| item.position);
        let mut best_score = -INF;
        let mut alpha = -INF;

        for (index, item) in moves.iter().enumerate() {
            if self.expired() {
                break;
            }
            let Some((child, won)) = play_move(position, item.position as usize) else {
                continue;
            };
            let mut score = if won {
                WIN - 1
            } else if index == 0 {
                -self.pvs(&child, depth.saturating_sub(1), -INF, -alpha, 1)
            } else {
                let scout = -self.pvs(&child, depth.saturating_sub(1), -alpha - 1, -alpha, 1);
                if scout > alpha && scout < INF && !self.timed_out {
                    -self.pvs(&child, depth.saturating_sub(1), -INF, -alpha, 1)
                } else {
                    scout
                }
            };
            if self.timed_out {
                break;
            }
            score = score.clamp(-WIN, WIN);
            if score > best_score {
                best_score = score;
                best_move = item.position;
            }
            alpha = alpha.max(score);
        }
        (best_move, best_score)
    }

    fn pvs(
        &mut self,
        position: &Position,
        depth: u8,
        mut alpha: i32,
        beta: i32,
        ply: usize,
    ) -> i32 {
        self.nodes = self.nodes.saturating_add(1);
        if self.expired() {
            return 0;
        }
        if depth == 0 {
            return self.quiescence(position, alpha, beta, self.profile.forcing_depth, ply);
        }

        let original_alpha = alpha;
        let cached = self.probe_table(position.hash).map(|mut entry| {
            entry.score = score_from_table(entry.score, ply);
            entry
        });
        if let Some(entry) = cached.filter(|entry| entry.depth >= depth) {
            match entry.flag {
                0 => return entry.score,
                1 => alpha = alpha.max(entry.score),
                _ if entry.score <= alpha => return entry.score,
                _ => {}
            }
            if alpha >= beta {
                return entry.score;
            }
        }

        let mut moves = candidate_moves(position);
        self.order_moves(
            position,
            &mut moves,
            cached.map_or(NO_MOVE, |entry| entry.best_move),
            ply,
        );
        let candidate_limit = match depth {
            0..=2 => self.profile.candidate_limit,
            3..=4 => self.profile.candidate_limit.min(16),
            _ => self.profile.candidate_limit.min(12),
        };
        preserve_tactical_moves(position, &mut moves, candidate_limit);
        if moves.is_empty() {
            return 0;
        }

        let mut best_move = NO_MOVE;
        let mut best_score = -INF;
        for (index, item) in moves.iter().enumerate() {
            let Some((child, won)) = play_move(position, item.position as usize) else {
                continue;
            };
            let tactical = won || !child.blocked.is_empty() || {
                let threat = threat_at(&child.board, item.position as usize, position.turn);
                threat.fours > 0 || threat.open_threes > 1
            };
            let score = if won {
                WIN - ply as i32
            } else if index == 0 {
                -self.pvs(&child, depth - 1, -beta, -alpha, ply + 1)
            } else if depth >= 3 && index >= 4 && !tactical {
                let reduced = -self.pvs(&child, depth - 2, -alpha - 1, -alpha, ply + 1);
                if reduced > alpha && !self.timed_out {
                    -self.pvs(&child, depth - 1, -beta, -alpha, ply + 1)
                } else {
                    reduced
                }
            } else {
                let scout = -self.pvs(&child, depth - 1, -alpha - 1, -alpha, ply + 1);
                if scout > alpha && scout < beta && !self.timed_out {
                    -self.pvs(&child, depth - 1, -beta, -alpha, ply + 1)
                } else {
                    scout
                }
            };
            if self.timed_out {
                return 0;
            }
            if score > best_score {
                best_score = score;
                best_move = item.position;
            }
            alpha = alpha.max(score);
            if alpha >= beta {
                self.record_cutoff(position.turn, item.position, depth, ply);
                break;
            }
        }

        let flag = if best_score <= original_alpha {
            2
        } else if best_score >= beta {
            1
        } else {
            0
        };
        self.store_table(
            position.hash,
            TableEntry {
                depth,
                score: score_to_table(best_score, ply),
                flag,
                best_move,
            },
        );
        best_score
    }

    fn probe_table(&self, key: u64) -> Option<TableEntry> {
        let slot = self.table[key as usize & (TABLE_SIZE - 1)];
        (slot.key == key && slot.entry.depth > 0).then_some(slot.entry)
    }

    fn store_table(&mut self, key: u64, entry: TableEntry) {
        let slot = &mut self.table[key as usize & (TABLE_SIZE - 1)];
        if slot.key == key || entry.depth >= slot.entry.depth {
            *slot = TableSlot { key, entry };
        }
    }

    fn quiescence(
        &mut self,
        position: &Position,
        mut alpha: i32,
        beta: i32,
        remaining: u8,
        ply: usize,
    ) -> i32 {
        self.nodes = self.nodes.saturating_add(1);
        if self.expired() {
            return 0;
        }
        let forcing = self.forcing_moves(position);
        let stand_pat = evaluate(position, position.turn);
        if forcing.kind == ForcingKind::None
            || (remaining == 0 && forcing.kind == ForcingKind::Attack)
        {
            return stand_pat;
        }
        let mandatory = forcing.kind == ForcingKind::Defense;
        if mandatory && forcing.moves.is_empty() {
            return -WIN + ply as i32;
        }
        if !mandatory {
            if stand_pat >= beta {
                return beta;
            }
            alpha = alpha.max(stand_pat);
        }
        for item in forcing.moves {
            let Some((child, won)) = play_move(position, item.position as usize) else {
                continue;
            };
            let score = if won {
                WIN - ply as i32
            } else if remaining == 0 {
                -evaluate(&child, child.turn)
            } else {
                -self.quiescence(&child, -beta, -alpha, remaining - 1, ply + 1)
            };
            if self.timed_out {
                return 0;
            }
            if score >= beta {
                return beta;
            }
            alpha = alpha.max(score);
        }
        alpha
    }

    fn forcing_moves(&mut self, position: &Position) -> ForcingLine {
        let candidates = candidate_positions(position);
        let wins = winning_positions(position, &candidates);
        if !wins.is_empty() {
            return ForcingLine {
                moves: score_positions(position, wins),
                kind: ForcingKind::Win,
            };
        }

        let enemy_position = for_opponent(position);
        let enemy_candidates = candidate_positions(&enemy_position);
        let enemy_wins = winning_positions(&enemy_position, &enemy_candidates);
        if !enemy_wins.is_empty() {
            let mut defenses = Vec::new();
            for movement in candidates {
                let Some((child, won)) = play_move_no_eval(position, movement as usize) else {
                    continue;
                };
                if won || winning_positions(&child, &candidate_positions(&child)).is_empty() {
                    defenses.push(movement);
                }
            }
            let mut defenses = score_positions(position, defenses);
            self.order_moves(position, &mut defenses, NO_MOVE, 0);
            return ForcingLine {
                moves: defenses,
                kind: ForcingKind::Defense,
            };
        }

        let mut forcing = Vec::new();
        for movement in candidates {
            let Some((child, won)) = play_move_no_eval(position, movement as usize) else {
                continue;
            };
            let threat = threat_at(&child.board, movement as usize, position.turn);
            if won
                || threat.fours > 0
                || (self.profile.include_open_threes
                    && position.occupied >= 8
                    && threat.open_threes > 1)
            {
                let mut item = ScoredMove {
                    position: movement,
                    score: quick_score(position, movement as usize),
                };
                item.score += threat_score(threat);
                forcing.push(item);
            }
        }
        forcing.sort_unstable_by_key(|item| std::cmp::Reverse(item.score));
        forcing.truncate(8);
        let kind = if forcing.is_empty() {
            ForcingKind::None
        } else {
            ForcingKind::Attack
        };
        ForcingLine {
            moves: forcing,
            kind,
        }
    }

    fn tactically_safe_root_moves(
        &mut self,
        position: &Position,
        ordered_candidates: &[ScoredMove],
    ) -> Vec<ScoredMove> {
        let candidates = ordered_candidates.to_vec();
        let wins = winning_moves(position, &candidates);
        if !wins.is_empty() {
            return wins;
        }

        let enemy = for_opponent(position);
        let enemy_wins = winning_moves(&enemy, &candidate_moves(&enemy));
        if enemy_wins.is_empty() && !self.profile.include_open_threes {
            return candidates;
        }

        let mut defenses = Vec::new();
        for item in &candidates {
            if self.expired() {
                break;
            }
            let Some((child, won)) = play_move_no_eval(position, item.position as usize) else {
                continue;
            };
            let stops_immediate_win =
                enemy_wins.is_empty() || winning_moves(&child, &candidate_moves(&child)).is_empty();
            let stops_double_threat =
                !self.profile.include_open_threes || !has_double_threat_reply(&child);
            if won || (stops_immediate_win && stops_double_threat) {
                defenses.push(*item);
            }
        }
        if defenses.is_empty() {
            candidates
        } else {
            defenses
        }
    }

    fn order_moves(
        &self,
        position: &Position,
        moves: &mut [ScoredMove],
        preferred: u16,
        ply: usize,
    ) {
        let killers = self.killers[ply.min(self.killers.len() - 1)];
        let side = (position.turn - 1) as usize;
        for item in moves.iter_mut() {
            if item.position == preferred {
                item.score += 400_000_000;
            } else if item.position == killers[0] {
                item.score += 30_000_000;
            } else if item.position == killers[1] {
                item.score += 20_000_000;
            }
            item.score += self.history[side][item.position as usize];
        }
        moves.sort_unstable_by(|left, right| {
            right
                .score
                .cmp(&left.score)
                .then(left.position.cmp(&right.position))
        });
    }

    fn record_cutoff(&mut self, turn: u8, position: u16, depth: u8, ply: usize) {
        let ply = ply.min(self.killers.len() - 1);
        if self.killers[ply][0] != position {
            self.killers[ply][1] = self.killers[ply][0];
            self.killers[ply][0] = position;
        }
        let history = &mut self.history[(turn - 1) as usize][position as usize];
        *history = history
            .saturating_add(i32::from(depth).pow(2) * 32)
            .min(5_000_000);
    }
}

fn find_best_move(
    board: [u8; CELLS],
    turn: u8,
    blocked: BitSet,
    difficulty: u8,
    time_budget_ms: u32,
    max_depth: u8,
) -> SearchResult {
    let position = Position::new(board, turn, blocked);
    let profile = Profile::for_difficulty(difficulty, max_depth);
    let mut search = Search::new(time_budget_ms, profile);
    let mut initial = candidate_moves(&position);
    search.order_moves(&position, &mut initial, NO_MOVE, 0);
    let root_moves = search.tactically_safe_root_moves(&position, &initial);
    if root_moves.len() == 1 && !search.timed_out {
        return SearchResult {
            position: Some(root_moves[0].position),
            depth: 1,
            nodes: search.nodes,
        };
    }
    let mut best_move = root_moves
        .first()
        .or_else(|| initial.first())
        .map_or(NO_MOVE, |item| item.position);
    let mut completed_depth = 0;

    for depth in 1..=profile.max_depth {
        let (candidate, score) = search.root(&position, &root_moves, best_move, depth);
        if search.timed_out {
            break;
        }
        best_move = candidate;
        completed_depth = depth;
        if score.abs() >= WIN - i32::from(depth) {
            break;
        }
    }

    SearchResult {
        position: (best_move != NO_MOVE).then_some(best_move),
        depth: completed_depth,
        nodes: search.nodes,
    }
}

impl Position {
    fn new(board: [u8; CELLS], turn: u8, blocked: BitSet) -> Self {
        let occupied = board.iter().filter(|cell| **cell != EMPTY).count() as u16;
        let mut position = Self {
            board,
            blocked,
            candidates: BitSet::default(),
            turn,
            hash: 0,
            occupied,
        };
        position.candidates = initial_candidates(&position.board);
        position.hash = hash_position(&position);
        position
    }
}

fn play_move(position: &Position, movement: usize) -> Option<(Position, bool)> {
    play_move_inner(position, movement)
}

fn play_move_no_eval(position: &Position, movement: usize) -> Option<(Position, bool)> {
    play_move_inner(position, movement)
}

fn play_move_inner(position: &Position, movement: usize) -> Option<(Position, bool)> {
    if movement >= CELLS || position.board[movement] != EMPTY || position.blocked.contains(movement)
    {
        return None;
    }
    let mut child = *position;
    let stone = position.turn;
    let enemy = opponent(stone);
    child.board[movement] = stone;
    child.occupied += 1;
    expand_candidates(&mut child.candidates, movement);

    let row = movement / SIZE;
    let column = movement % SIZE;
    let mut captured = BitSet::default();
    for (row_step, column_step) in CAPTURE_DIRECTIONS {
        let first = offset(row, column, row_step, column_step, 1);
        let second = offset(row, column, row_step, column_step, 2);
        let bracket = offset(row, column, row_step, column_step, 3);
        if let (Some(first), Some(second), Some(bracket)) = (first, second, bracket)
            && child.board[first] == enemy
            && child.board[second] == enemy
            && child.board[bracket] == stone
        {
            captured.insert(first);
            captured.insert(second);
        }
    }
    for captured_position in captured.positions() {
        child.board[captured_position] = EMPTY;
        child.occupied -= 1;
    }
    if !captured.is_empty() {
        child.candidates = initial_candidates(&child.board);
    }

    let won = has_five_from(&child.board, movement, stone);
    child.blocked = captured;
    child.turn = enemy;
    child.hash = position.hash ^ turn_hash(stone) ^ turn_hash(enemy);
    child.hash ^= zobrist(movement * 2 + stone as usize);
    for blocked in position.blocked.positions() {
        child.hash ^= zobrist(500 + blocked);
    }
    for captured_position in captured.positions() {
        child.hash ^= zobrist(captured_position * 2 + enemy as usize);
        child.hash ^= zobrist(500 + captured_position);
    }
    Some((child, won))
}

fn candidate_moves(position: &Position) -> Vec<ScoredMove> {
    candidate_positions(position)
        .into_iter()
        .map(|movement| ScoredMove {
            position: movement,
            score: quick_score(position, movement as usize),
        })
        .collect()
}

fn preserve_tactical_moves(position: &Position, moves: &mut Vec<ScoredMove>, quiet_limit: usize) {
    if moves.len() <= quiet_limit {
        return;
    }
    let tactical_tail: Vec<_> = moves
        .iter()
        .skip(quiet_limit)
        .filter_map(|item| {
            let (child, won) = play_move_no_eval(position, item.position as usize)?;
            let captured = child.occupied <= position.occupied;
            let threat = threat_at(&child.board, item.position as usize, position.turn);
            (won || captured || threat.fours > 0 || threat.open_threes > 1).then_some(*item)
        })
        .collect();
    moves.truncate(quiet_limit);
    moves.extend(tactical_tail);
}

fn candidate_positions(position: &Position) -> Vec<u16> {
    if position.occupied == 0 {
        let center = CELLS / 2;
        if !position.blocked.contains(center) {
            return vec![center as u16];
        }
    }

    let mut moves = Vec::with_capacity(64);
    for movement in 0..CELLS {
        if position.candidates.contains(movement)
            && position.board[movement] == EMPTY
            && !position.blocked.contains(movement)
        {
            moves.push(movement as u16);
        }
    }
    moves
}

fn initial_candidates(board: &[u8; CELLS]) -> BitSet {
    let mut candidates = BitSet::default();
    for (position, stone) in board.iter().enumerate() {
        if *stone != EMPTY {
            expand_candidates(&mut candidates, position);
        }
    }
    candidates
}

fn expand_candidates(candidates: &mut BitSet, position: usize) {
    let row = position / SIZE;
    let column = position % SIZE;
    for row_delta in -2_i8..=2 {
        for column_delta in -2_i8..=2 {
            let next_row = row as i8 + row_delta;
            let next_column = column as i8 + column_delta;
            if in_bounds(next_row, next_column) {
                candidates.insert(next_row as usize * SIZE + next_column as usize);
            }
        }
    }
}

fn quick_score(position: &Position, movement: usize) -> i32 {
    let Some((child, won)) = play_move_no_eval(position, movement) else {
        return -INF;
    };
    if won {
        return WIN;
    }
    let own = threat_at(&child.board, movement, position.turn);
    let own_captures = position.occupied + 1 - child.occupied;
    let enemy_position = for_opponent(position);
    let (enemy, enemy_captures) = play_move_no_eval(&enemy_position, movement)
        .map(|(reply, _)| {
            (
                threat_at(&reply.board, movement, enemy_position.turn),
                position.occupied + 1 - reply.occupied,
            )
        })
        .unwrap_or_default();
    let row = movement / SIZE;
    let column = movement % SIZE;
    let center = 7_i32;
    let center_bonus = 15 - (row as i32 - center).abs() - (column as i32 - center).abs();
    threat_score(own) * 2
        + threat_score(enemy)
        + i32::from(own_captures) * 30_000
        + i32::from(enemy_captures) * 20_000
        + center_bonus
}

fn threat_score(threat: Threat) -> i32 {
    if threat.immediate_win {
        return WIN / 2;
    }
    let four_score = if threat.fours >= 2 {
        8_000_000
    } else {
        i32::from(threat.fours) * 2_000_000
    };
    let three_score = if threat.open_threes >= 2 {
        600_000
    } else {
        i32::from(threat.open_threes) * 40_000
    };
    four_score + three_score
}

fn threat_at(board: &[u8; CELLS], movement: usize, stone: u8) -> Threat {
    let row = movement / SIZE;
    let column = movement % SIZE;
    let mut threat = Threat::default();
    let mut winning_replies = BitSet::default();
    for (row_step, column_step) in DIRECTIONS {
        let mut line = [3_u8; 11];
        for distance in -5_i8..=5 {
            let next_row = row as i8 + row_step * distance;
            let next_column = column as i8 + column_step * distance;
            if in_bounds(next_row, next_column) {
                line[(distance + 5) as usize] =
                    board[next_row as usize * SIZE + next_column as usize];
            }
        }
        for start in 1..=5 {
            let window = &line[start..start + 5];
            let stone_count = window.iter().filter(|cell| **cell == stone).count();
            if stone_count == 5 {
                threat.immediate_win = true;
            } else if stone_count == 4 && window.iter().all(|cell| *cell == stone || *cell == EMPTY)
            {
                let empty = window.iter().position(|cell| *cell == EMPTY).unwrap();
                let distance = (start + empty) as i8 - 5;
                let reply_row = row as i8 + row_step * distance;
                let reply_column = column as i8 + column_step * distance;
                if in_bounds(reply_row, reply_column) {
                    winning_replies.insert(reply_row as usize * SIZE + reply_column as usize);
                }
            }
        }
        let mut open_three = false;
        for start in 0..=5 {
            let window = &line[start..start + 6];
            if window[0] == EMPTY
                && window[5] == EMPTY
                && window[1..5]
                    .iter()
                    .all(|cell| *cell == stone || *cell == EMPTY)
                && window[1..5].iter().filter(|cell| **cell == stone).count() == 3
            {
                open_three = true;
            }
        }
        threat.open_threes += u8::from(open_three);
    }
    threat.fours = winning_replies.positions().count() as u8;
    threat
}

fn winning_moves(position: &Position, candidates: &[ScoredMove]) -> Vec<ScoredMove> {
    candidates
        .iter()
        .filter_map(|item| {
            play_move_no_eval(position, item.position as usize)
                .and_then(|(_, won)| won.then_some(*item))
        })
        .collect()
}

fn winning_positions(position: &Position, candidates: &[u16]) -> Vec<u16> {
    candidates
        .iter()
        .filter_map(|movement| {
            play_move_no_eval(position, *movement as usize)
                .and_then(|(_, won)| won.then_some(*movement))
        })
        .collect()
}

fn score_positions(position: &Position, positions: Vec<u16>) -> Vec<ScoredMove> {
    positions
        .into_iter()
        .map(|movement| ScoredMove {
            position: movement,
            score: quick_score(position, movement as usize),
        })
        .collect()
}

fn has_double_threat_reply(position: &Position) -> bool {
    candidate_positions(position).iter().any(|movement| {
        let Some((child, won)) = play_move_no_eval(position, *movement as usize) else {
            return false;
        };
        if won {
            return true;
        }
        let threat = threat_at(&child.board, *movement as usize, position.turn);
        threat.fours >= 2 || threat.open_threes >= 2
    })
}

fn for_opponent(position: &Position) -> Position {
    let mut enemy = *position;
    enemy.turn = opponent(position.turn);
    enemy.blocked = BitSet::default();
    enemy.hash ^= turn_hash(position.turn) ^ turn_hash(enemy.turn);
    for blocked in position.blocked.positions() {
        enemy.hash ^= zobrist(500 + blocked);
    }
    enemy
}

fn evaluate(position: &Position, stone: u8) -> i32 {
    let enemy = opponent(stone);
    let own_blocked = if stone == position.turn {
        position.blocked
    } else {
        BitSet::default()
    };
    let enemy_blocked = if enemy == position.turn {
        position.blocked
    } else {
        BitSet::default()
    };
    let own = i64::from(score_board(&position.board, stone, own_blocked));
    let theirs = i64::from(score_board(&position.board, enemy, enemy_blocked));
    (own - theirs * 11 / 10).clamp(i64::from(-WIN + 1), i64::from(WIN - 1)) as i32
}

fn score_board(board: &[u8; CELLS], stone: u8, blocked: BitSet) -> i32 {
    let mut score = 0_i32;
    for line in 0..LINE_COUNT {
        score = score.saturating_add(score_line(board, stone, blocked, line));
    }
    score
}

fn score_line(board: &[u8; CELLS], stone: u8, blocked: BitSet, line: usize) -> i32 {
    let (start_row, start_column, row_step, column_step) = line_spec(line);
    let mut line = [3_u8; SIZE];
    let mut length = 0;
    let mut row = start_row as i8;
    let mut column = start_column as i8;
    while in_bounds(row, column) {
        let index = row as usize * SIZE + column as usize;
        line[length] = if blocked.contains(index) {
            3
        } else {
            board[index]
        };
        length += 1;
        row += row_step;
        column += column_step;
    }
    if length < 5 {
        return 0;
    }

    let mut score = 0_i32;
    let mut index = 0;
    while index < length {
        if line[index] != stone {
            index += 1;
            continue;
        }
        let start = index;
        while index < length && line[index] == stone {
            index += 1;
        }
        let run = index - start;
        let open = usize::from(start > 0 && line[start - 1] == EMPTY)
            + usize::from(index < length && line[index] == EMPTY);
        score = score.saturating_add(run_score(run, open));
    }

    for start in 0..=length - 5 {
        let window = &line[start..start + 5];
        if window.iter().all(|cell| *cell == stone || *cell == EMPTY) {
            score =
                score.saturating_add(match window.iter().filter(|cell| **cell == stone).count() {
                    5 => WIN,
                    4 => 180_000,
                    3 => 6_000,
                    2 => 180,
                    _ => 0,
                });
        }
    }
    if length >= 6 {
        for start in 0..=length - 6 {
            let window = &line[start..start + 6];
            if window[0] == EMPTY
                && window[5] == EMPTY
                && window[1..5]
                    .iter()
                    .all(|cell| *cell == stone || *cell == EMPTY)
            {
                score = score.saturating_add(
                    match window[1..5].iter().filter(|cell| **cell == stone).count() {
                        4 => 2_000_000,
                        3 => 30_000,
                        2 => 800,
                        _ => 0,
                    },
                );
            }
        }
    }
    score
}

fn line_spec(line: usize) -> (usize, usize, i8, i8) {
    match line {
        0..=14 => (line, 0, 0, 1),
        15..=29 => (0, line - 15, 1, 0),
        30..=44 => (0, line - 30, 1, 1),
        45..=58 => (line - 44, 0, 1, 1),
        59..=73 => (0, line - 59, 1, -1),
        _ => (line - 73, SIZE - 1, 1, -1),
    }
}

fn run_score(run: usize, open: usize) -> i32 {
    match (run, open) {
        (5.., _) => WIN,
        (4, 2) => 2_000_000,
        (4, 1) => 180_000,
        (3, 2) => 24_000,
        (3, 1) => 1_800,
        (2, 2) => 700,
        (2, 1) => 90,
        (1, 2) => 12,
        (1, 1) => 2,
        _ => 0,
    }
}

fn has_five_from(board: &[u8; CELLS], movement: usize, stone: u8) -> bool {
    let row = movement / SIZE;
    let column = movement % SIZE;
    DIRECTIONS.iter().any(|(row_step, column_step)| {
        let forward = count_stones(board, row, column, *row_step, *column_step, stone);
        let backward = count_stones(board, row, column, -*row_step, -*column_step, stone);
        1 + forward + backward >= 5
    })
}

fn count_stones(
    board: &[u8; CELLS],
    row: usize,
    column: usize,
    row_step: i8,
    column_step: i8,
    stone: u8,
) -> usize {
    let mut count = 0;
    let mut next_row = row as i8 + row_step;
    let mut next_column = column as i8 + column_step;
    while in_bounds(next_row, next_column)
        && board[next_row as usize * SIZE + next_column as usize] == stone
    {
        count += 1;
        next_row += row_step;
        next_column += column_step;
    }
    count
}

fn offset(row: usize, column: usize, row_step: i8, column_step: i8, distance: i8) -> Option<usize> {
    let next_row = row as i8 + row_step * distance;
    let next_column = column as i8 + column_step * distance;
    if in_bounds(next_row, next_column) {
        Some(next_row as usize * SIZE + next_column as usize)
    } else {
        None
    }
}

fn in_bounds(row: i8, column: i8) -> bool {
    row >= 0 && row < SIZE as i8 && column >= 0 && column < SIZE as i8
}

fn opponent(stone: u8) -> u8 {
    if stone == BLACK { WHITE } else { BLACK }
}

fn hash_position(position: &Position) -> u64 {
    let mut hash = turn_hash(position.turn);
    for index in 0..CELLS {
        if position.board[index] != EMPTY {
            hash ^= zobrist(index * 2 + position.board[index] as usize);
        }
        if position.blocked.contains(index) {
            hash ^= zobrist(500 + index);
        }
    }
    hash
}

fn turn_hash(turn: u8) -> u64 {
    zobrist(if turn == BLACK { 900 } else { 901 })
}

fn zobrist(seed: usize) -> u64 {
    let mut value = (seed as u64).wrapping_add(0x9e37_79b9_7f4a_7c15);
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

fn score_to_table(score: i32, ply: usize) -> i32 {
    if score >= MATE_SCORE_THRESHOLD {
        score.saturating_add(ply as i32)
    } else if score <= -MATE_SCORE_THRESHOLD {
        score.saturating_sub(ply as i32)
    } else {
        score
    }
}

fn score_from_table(score: i32, ply: usize) -> i32 {
    if score >= MATE_SCORE_THRESHOLD {
        score.saturating_sub(ply as i32)
    } else if score <= -MATE_SCORE_THRESHOLD {
        score.saturating_add(ply as i32)
    } else {
        score
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bot_alloc(length: usize) -> *mut u8 {
    let mut allocation = Vec::<u8>::with_capacity(length);
    let pointer = allocation.as_mut_ptr();
    std::mem::forget(allocation);
    pointer
}

#[unsafe(no_mangle)]
/// # Safety
/// `pointer` must have been returned by `bot_alloc` with the same `length` and
/// must not have been deallocated previously.
pub unsafe extern "C" fn bot_dealloc(pointer: *mut u8, length: usize) {
    if !pointer.is_null() {
        unsafe { drop(Vec::from_raw_parts(pointer, 0, length)) };
    }
}

#[unsafe(no_mangle)]
/// # Safety
/// `input_pointer` must reference `CELLS * 2` initialized bytes allocated in
/// this module's linear memory for the duration of the call.
pub unsafe extern "C" fn bot_search(
    input_pointer: *const u8,
    turn: u8,
    difficulty: u8,
    time_budget_ms: u32,
    max_depth: u8,
) -> f64 {
    if input_pointer.is_null() || (turn != BLACK && turn != WHITE) {
        return 255.0;
    }
    let input = unsafe { std::slice::from_raw_parts(input_pointer, CELLS * 2) };
    let mut board = [EMPTY; CELLS];
    board.copy_from_slice(&input[..CELLS]);
    if board.iter().any(|cell| *cell > WHITE) {
        return 255.0;
    }
    let mut blocked = BitSet::default();
    for (position, value) in input[CELLS..].iter().enumerate() {
        if *value != 0 {
            blocked.insert(position);
        }
    }

    let result = find_best_move(board, turn, blocked, difficulty, time_budget_ms, max_depth);
    let position = result.position.map_or(255_u64, u64::from);
    let packed = (u64::from(result.nodes) << 16) | (u64::from(result.depth) << 8) | position;
    packed as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn board_with(stones: &[(usize, u8)]) -> [u8; CELLS] {
        let mut board = [EMPTY; CELLS];
        for (position, stone) in stones {
            board[*position] = *stone;
        }
        board
    }

    #[test]
    fn captures_pairs_and_blocks_them_for_the_reply() {
        let position = Position::new(
            board_with(&[(112, BLACK), (113, WHITE), (114, WHITE)]),
            BLACK,
            BitSet::default(),
        );
        let (child, won) = play_move(&position, 115).unwrap();

        assert!(!won);
        assert_eq!(child.board[113], EMPTY);
        assert_eq!(child.board[114], EMPTY);
        assert!(child.blocked.contains(113));
        assert!(play_move(&child, 113).is_none());
    }

    #[test]
    fn incremental_hash_matches_full_recomputation_after_capture() {
        let position = Position::new(
            board_with(&[
                (82, WHITE),
                (97, WHITE),
                (110, BLACK),
                (112, BLACK),
                (113, WHITE),
                (114, WHITE),
            ]),
            BLACK,
            BitSet::default(),
        );
        let (child, _) = play_move(&position, 115).unwrap();

        assert_eq!(child.hash, hash_position(&child));
        let expected_white = score_board(&child.board, WHITE, child.blocked);
        let expected_black = score_board(&child.board, BLACK, BitSet::default());
        let expected = (i64::from(expected_white) - i64::from(expected_black) * 11 / 10)
            .clamp(i64::from(-WIN + 1), i64::from(WIN - 1)) as i32;
        assert_eq!(evaluate(&child, WHITE), expected);
    }

    #[test]
    fn capture_candidates_match_a_rebuilt_position() {
        let position = Position::new(
            board_with(&[(64, BLACK), (80, WHITE), (96, WHITE)]),
            BLACK,
            BitSet::default(),
        );
        let (child, _) = play_move(&position, 112).unwrap();
        let rebuilt = Position::new(child.board, child.turn, child.blocked);

        assert_eq!(candidate_positions(&child), candidate_positions(&rebuilt));
        assert!(!candidate_positions(&child).contains(&52));
    }

    #[test]
    fn table_mate_scores_preserve_distance_across_plies() {
        let winning_score = WIN - 7;
        let losing_score = -WIN + 7;

        assert_eq!(
            score_from_table(score_to_table(winning_score, 7), 11),
            WIN - 11
        );
        assert_eq!(
            score_from_table(score_to_table(losing_score, 7), 11),
            -WIN + 11
        );
        assert_eq!(score_from_table(score_to_table(42_000, 7), 11), 42_000);
    }

    #[test]
    fn takes_an_immediate_win() {
        let result = find_best_move(
            board_with(&[(110, BLACK), (111, BLACK), (112, BLACK), (113, BLACK)]),
            BLACK,
            BitSet::default(),
            2,
            100,
            2,
        );

        assert!(matches!(result.position, Some(109 | 114)));
    }

    #[test]
    fn never_searches_past_an_immediate_defense() {
        let result = find_best_move(
            board_with(&[(110, WHITE), (111, WHITE), (112, WHITE), (113, WHITE)]),
            BLACK,
            BitSet::default(),
            2,
            100,
            1,
        );

        assert!(matches!(result.position, Some(109 | 114)));
    }

    #[test]
    fn vcf_includes_capture_based_defenses() {
        let position = Position::new(
            board_with(&[
                (110, WHITE),
                (111, WHITE),
                (112, WHITE),
                (113, WHITE),
                (125, WHITE),
                (140, BLACK),
            ]),
            BLACK,
            BitSet::default(),
        );
        let mut search = Search::new(100, Profile::for_difficulty(2, 2));

        let forcing = search.forcing_moves(&position);

        assert!(forcing.kind == ForcingKind::Defense);
        assert!(forcing.moves.iter().any(|item| item.position == 95));
    }

    #[test]
    fn recognizes_an_open_three_fork() {
        let mut board = board_with(&[
            (82, WHITE),
            (97, WHITE),
            (110, WHITE),
            (111, WHITE),
            (16, BLACK),
            (144, BLACK),
        ]);
        board[112] = WHITE;
        let threat = threat_at(&board, 112, WHITE);

        assert!(threat.open_threes >= 2);
    }

    #[test]
    fn counts_a_shared_winning_gap_only_once() {
        let mut board = board_with(&[(105, BLACK), (106, BLACK), (107, BLACK), (108, BLACK)]);
        board[110] = BLACK;

        let threat = threat_at(&board, 110, BLACK);

        assert_eq!(threat.fours, 1);
    }

    #[test]
    fn orders_pair_captures_ahead_of_quiet_moves() {
        let position = Position::new(
            board_with(&[(112, BLACK), (113, WHITE), (114, WHITE)]),
            BLACK,
            BitSet::default(),
        );

        assert!(quick_score(&position, 115) > quick_score(&position, 96));
    }

    #[test]
    fn candidate_cap_preserves_a_low_ranked_capture() {
        let position = Position::new(
            board_with(&[(112, BLACK), (113, WHITE), (114, WHITE)]),
            BLACK,
            BitSet::default(),
        );
        let mut moves: Vec<_> = (0..20)
            .map(|movement| ScoredMove {
                position: movement,
                score: 20 - i32::from(movement),
            })
            .collect();
        moves.push(ScoredMove {
            position: 115,
            score: -1,
        });

        preserve_tactical_moves(&position, &mut moves, 12);

        assert_eq!(moves.len(), 13);
        assert_eq!(moves.last().map(|item| item.position), Some(115));
    }

    #[test]
    fn closes_the_gap_in_a_broken_three() {
        let result = find_best_move(
            board_with(&[(106, WHITE), (107, WHITE), (109, WHITE), (95, BLACK)]),
            BLACK,
            BitSet::default(),
            2,
            250,
            2,
        );

        assert_eq!(result.position, Some(108));
    }

    #[test]
    fn does_not_play_a_temporarily_blocked_gap() {
        let mut blocked = BitSet::default();
        blocked.insert(108);
        let result = find_best_move(
            board_with(&[
                (106, WHITE),
                (107, WHITE),
                (109, WHITE),
                (112, BLACK),
                (113, BLACK),
                (114, BLACK),
            ]),
            BLACK,
            blocked,
            2,
            250,
            3,
        );

        assert_ne!(result.position, Some(108));
        assert!(
            matches!(result.position, Some(105 | 110 | 111 | 115 | 116)),
            "unexpected move: {result:?}",
        );
    }

    #[test]
    fn hard_defends_a_double_open_three() {
        let result = find_best_move(
            board_with(&[
                (82, WHITE),
                (97, WHITE),
                (110, WHITE),
                (111, WHITE),
                (16, BLACK),
                (144, BLACK),
            ]),
            BLACK,
            BitSet::default(),
            2,
            250,
            1,
        );

        assert_eq!(result.position, Some(112));
    }

    #[test]
    #[ignore = "manual engine benchmark"]
    fn benchmark_search_corpus() {
        let cases = [
            ("center opening", board_with(&[(112, BLACK)]), WHITE),
            (
                "developed center",
                board_with(&[
                    (112, BLACK),
                    (96, WHITE),
                    (111, BLACK),
                    (113, WHITE),
                    (97, BLACK),
                    (127, WHITE),
                    (82, BLACK),
                    (126, WHITE),
                ]),
                BLACK,
            ),
            (
                "capture available",
                board_with(&[
                    (112, BLACK),
                    (113, WHITE),
                    (114, WHITE),
                    (96, BLACK),
                    (97, WHITE),
                    (98, BLACK),
                ]),
                BLACK,
            ),
            (
                "fork defense",
                board_with(&[
                    (82, WHITE),
                    (97, WHITE),
                    (110, WHITE),
                    (111, WHITE),
                    (16, BLACK),
                    (144, BLACK),
                ]),
                BLACK,
            ),
        ];

        for (name, board, turn) in cases {
            let result = find_best_move(board, turn, BitSet::default(), 2, 250, 10);
            println!(
                "{name}: move={:?} depth={} nodes={}",
                result.position, result.depth, result.nodes
            );
            assert!(result.position.is_some());
        }
    }
}
