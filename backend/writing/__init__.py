def init_writing(app):
    from .routes import bp
    app.register_blueprint(bp)
