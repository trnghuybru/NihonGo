def init_vocabulary(app):
    from .routes import bp
    from .importer import import_command
    from .audio import import_command as audio_import_command
    from video_examples import init_video_examples
    app.register_blueprint(bp)
    app.cli.add_command(import_command)
    app.cli.add_command(audio_import_command)
    init_video_examples(app)
