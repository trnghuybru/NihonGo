def init_jlpt(app):
    from .routes import bp
    app.register_blueprint(bp)
