def init_shadowing(app):
    from .routes import bp
    app.register_blueprint(bp)
    from .rebuild import rebuild_command
    app.cli.add_command(rebuild_command)
    from .words import prepare_command
    app.cli.add_command(prepare_command)
