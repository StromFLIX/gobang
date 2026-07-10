import pytest

from app.domain.rules import BOARD_SIZE, MoveError, Stone, apply_move, empty_board


def board_with(stones: dict[int, Stone]) -> tuple[Stone | None, ...]:
    board = list(empty_board())
    for position, stone in stones.items():
        board[position] = stone
    return tuple(board)


@pytest.mark.parametrize(
    ("positions", "move", "captured"),
    [
        ({3: Stone.BLACK, 1: Stone.WHITE, 2: Stone.WHITE}, 0, (1, 2)),
        ({0: Stone.BLACK, 1: Stone.WHITE, 2: Stone.WHITE}, 3, (1, 2)),
        ({45: Stone.BLACK, 15: Stone.WHITE, 30: Stone.WHITE}, 0, (15, 30)),
        ({0: Stone.BLACK, 15: Stone.WHITE, 30: Stone.WHITE}, 45, (15, 30)),
        ({48: Stone.BLACK, 16: Stone.WHITE, 32: Stone.WHITE}, 0, (16, 32)),
        ({0: Stone.BLACK, 16: Stone.WHITE, 32: Stone.WHITE}, 48, (16, 32)),
        ({45: Stone.BLACK, 17: Stone.WHITE, 31: Stone.WHITE}, 3, (17, 31)),
        ({3: Stone.BLACK, 17: Stone.WHITE, 31: Stone.WHITE}, 45, (17, 31)),
    ],
)
def test_captures_pairs_in_every_direction(
    positions: dict[int, Stone], move: int, captured: tuple[int, int]
) -> None:
    result = apply_move(board_with(positions), move, Stone.BLACK)

    assert result.captured == captured
    assert all(result.board[position] is None for position in captured)


def test_resolves_multiple_captures_from_one_move() -> None:
    board = board_with(
        {
            3: Stone.BLACK,
            1: Stone.WHITE,
            2: Stone.WHITE,
            45: Stone.BLACK,
            15: Stone.WHITE,
            30: Stone.WHITE,
        }
    )

    result = apply_move(board, 0, Stone.BLACK)

    assert result.captured == (1, 2, 15, 30)


@pytest.mark.parametrize("start", [0, BOARD_SIZE * 5 + 4])
def test_five_or_more_stones_wins(start: int) -> None:
    board = board_with({start + offset: Stone.BLACK for offset in range(5)})

    result = apply_move(board, start + 5, Stone.BLACK)

    assert result.winner is Stone.BLACK


def test_capture_resolves_before_win_detection() -> None:
    board = board_with(
        {
            0: Stone.BLACK,
            1: Stone.BLACK,
            2: Stone.BLACK,
            3: Stone.BLACK,
            18: Stone.BLACK,
            16: Stone.WHITE,
            17: Stone.WHITE,
        }
    )

    result = apply_move(board, 4, Stone.BLACK)

    assert result.winner is Stone.BLACK
    assert result.captured == ()


def test_captured_position_can_be_reused() -> None:
    first = apply_move(
        board_with({0: Stone.BLACK, 1: Stone.WHITE, 2: Stone.WHITE}),
        3,
        Stone.BLACK,
    )

    second = apply_move(first.board, 1, Stone.WHITE)

    assert second.board[1] is Stone.WHITE


@pytest.mark.parametrize("position", [-1, BOARD_SIZE * BOARD_SIZE])
def test_rejects_out_of_bounds_position(position: int) -> None:
    with pytest.raises(MoveError, match="outside"):
        apply_move(empty_board(), position, Stone.BLACK)


def test_rejects_occupied_position() -> None:
    with pytest.raises(MoveError, match="occupied"):
        apply_move(board_with({4: Stone.WHITE}), 4, Stone.BLACK)


def test_rejects_malformed_board() -> None:
    with pytest.raises(MoveError, match="225"):
        apply_move((None,), 0, Stone.BLACK)