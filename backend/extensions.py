"""Shared application extensions; models must use this single database instance."""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
