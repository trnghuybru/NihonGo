def init_learning(app):
    from .routes import bp
    app.register_blueprint(bp)
