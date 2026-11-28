def init_jlpt(app):
    from . import models
    from .database import import_command
    from .routes import bp
    app.register_blueprint(bp)
    app.cli.add_command(import_command)
