import json
import os
import ssl

import pg8000.dbapi


_conn = None


def _config():
    host, port, name, user, pw = (os.environ.get("PGHOST"), int(os.environ.get("PGPORT", 5432)), os.environ.get("PGDATABASE"),
                                  os.environ.get("PGUSER"), os.environ.get("PGPASSWORD"))
    arn = os.environ.get("DB_SECRET_ARN")
    if arn:
        import boto3
        s = json.loads(boto3.client("secretsmanager").get_secret_value(SecretId=arn)["SecretString"])
        host, port = os.environ.get("DB_HOST", s["host"]), int(s.get("port", 5432))
        name, user, pw = os.environ.get("DB_NAME", s.get("dbname", "payroll")), s["username"], s["password"]
    return host, port, name, user, pw


def get_conn():
    global _conn
    if _conn is not None:
        try:
            cur = _conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
            _conn.rollback()
            return _conn
        except Exception:
            try:
                _conn.close()
            except Exception:
                pass
            _conn = None
    host, port, name, user, pw = _config()
    ctx = None
    if os.environ.get("DB_SSL", "enable") != "disable":
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    _conn = pg8000.dbapi.connect(host=host, port=port, database=name, user=user, password=pw, ssl_context=ctx)
    return _conn
