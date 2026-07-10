from dataclasses import replace

from app.domain.game import Game, GameStatus, Move, Player
from app.domain.rules import Stone, empty_board
from app.repositories.pocketbase_games import game_from_record, game_to_record


def test_game_record_round_trip() -> None:
    board = list(empty_board())
    board[16] = Stone.BLACK
    host = Player("host", "Flo", "avatar-one", False)
    guest = Player("guest", "Felix", "avatar-two")
    game = Game(
        id="record-id",
        invite_code="invite-code",
        host=host,
        guest=guest,
        black_player_id=host.id,
        white_player_id=guest.id,
        status=GameStatus.ACTIVE,
        board=tuple(board),
        turn=Stone.WHITE,
        moves=[Move(host.id, 16, Stone.BLACK, (17, 18))],
        black_captures=1,
        revision=3,
        round=2,
        host_score=1,
        guest_score=2,
        host_rematch=True,
    )

    payload = game_to_record(game)
    restored = game_from_record({"id": game.id, **payload})

    assert restored == game


def test_waiting_game_record_round_trip() -> None:
    game = Game(
        id="waiting-id",
        invite_code="waiting-code",
        host=Player("host", "Flo", "avatar-one"),
    )

    payload = game_to_record(game)
    restored = game_from_record({"id": game.id, **payload})

    assert restored == replace(game)