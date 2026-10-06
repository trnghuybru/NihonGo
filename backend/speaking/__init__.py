"""Persistence for speaking practice, voice rooms, and matchmaking."""


def init_speaking(app):
    from .routes import bp
    from .seed import seed_scenarios
    app.register_blueprint(bp)
    app.cli.add_command(seed_scenarios)
