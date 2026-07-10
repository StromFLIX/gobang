from dataclasses import dataclass
from enum import StrEnum

BOARD_SIZE = 15
CELL_COUNT = BOARD_SIZE * BOARD_SIZE


class Stone(StrEnum):
    BLACK = "black"
    WHITE = "white"

    @property
    def opponent(self) -> "Stone":
        return Stone.WHITE if self is Stone.BLACK else Stone.BLACK


class MoveError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class MoveResult:
    board: tuple[Stone | None, ...]
    captured: tuple[int, ...]
    winner: Stone | None
    is_draw: bool


def empty_board() -> tuple[None, ...]:
    return (None,) * CELL_COUNT


def apply_move(
    board: tuple[Stone | None, ...],
    position: int,
    stone: Stone,
) -> MoveResult:
    if len(board) != CELL_COUNT:
        raise MoveError(f"Board must contain exactly {CELL_COUNT} cells")
    if position < 0 or position >= CELL_COUNT:
        raise MoveError("Position is outside the board")
    if board[position] is not None:
        raise MoveError("Position is already occupied")

    next_board = list(board)
    next_board[position] = stone
    captured = _captured_positions(next_board, position, stone)
    for captured_position in captured:
        next_board[captured_position] = None

    resolved_board = tuple(next_board)
    winner = stone if _has_five(resolved_board, stone) else None
    return MoveResult(
        board=resolved_board,
        captured=tuple(sorted(captured)),
        winner=winner,
        is_draw=winner is None and all(cell is not None for cell in resolved_board),
    )


def _captured_positions(
    board: list[Stone | None],
    position: int,
    stone: Stone,
) -> set[int]:
    row, column = divmod(position, BOARD_SIZE)
    captured: set[int] = set()

    for row_step, column_step in _directions(eight_way=True):
        coordinates = [
            (row + row_step * distance, column + column_step * distance)
            for distance in (1, 2, 3)
        ]
        if not all(
            _in_bounds(candidate_row, candidate_column)
            for candidate_row, candidate_column in coordinates
        ):
            continue

        first, second, bracket = (
            candidate_row * BOARD_SIZE + candidate_column
            for candidate_row, candidate_column in coordinates
        )
        if (
            board[first] is stone.opponent
            and board[second] is stone.opponent
            and board[bracket] is stone
        ):
            captured.update((first, second))

    return captured


def _has_five(board: tuple[Stone | None, ...], stone: Stone) -> bool:
    for position, cell in enumerate(board):
        if cell is not stone:
            continue
        row, column = divmod(position, BOARD_SIZE)
        for row_step, column_step in _directions(eight_way=False):
            previous_row = row - row_step
            previous_column = column - column_step
            if _in_bounds(previous_row, previous_column):
                previous = previous_row * BOARD_SIZE + previous_column
                if board[previous] is stone:
                    continue

            run_length = 0
            current_row = row
            current_column = column
            while _in_bounds(current_row, current_column):
                current = current_row * BOARD_SIZE + current_column
                if board[current] is not stone:
                    break
                run_length += 1
                if run_length >= 5:
                    return True
                current_row += row_step
                current_column += column_step
    return False


def _directions(*, eight_way: bool) -> tuple[tuple[int, int], ...]:
    primary = ((0, 1), (1, 0), (1, 1), (1, -1))
    if not eight_way:
        return primary
    return primary + tuple((-row_step, -column_step) for row_step, column_step in primary)


def _in_bounds(row: int, column: int) -> bool:
    return 0 <= row < BOARD_SIZE and 0 <= column < BOARD_SIZE
