def init_flashcards(app):
    from .routes import bp
    from . import daily  # noqa: F401 - register daily routes before the blueprint
    from . import srs
    app.register_blueprint(bp)
    srs.register_commands(app)
