"""Persistence for speaking practice, voice rooms, and matchmaking."""


def init_speaking(app):
    from .routes import bp
    from .seed import seed_scenarios
    from .storage import initialize_bucket
    from .local_storage import bp as audio_objects_bp
    from .deletion import cleanup_command
    app.register_blueprint(bp)
    app.register_blueprint(audio_objects_bp)
    app.cli.add_command(seed_scenarios)
    app.cli.add_command(initialize_bucket)
    app.cli.add_command(cleanup_command)
