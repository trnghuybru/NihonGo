def init_reading(app):
    from .routes import bp
    from .importer import import_command
    from .replacement import replace_command
    app.register_blueprint(bp)
    app.cli.add_command(import_command)
    app.cli.add_command(replace_command)
