def init_dictionary(app):
    from .routes import bp
    from .importer import import_command
    app.register_blueprint(bp)
    app.cli.add_command(import_command)
