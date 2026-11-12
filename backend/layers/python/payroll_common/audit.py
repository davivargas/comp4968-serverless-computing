SENSITIVE = {"password", "account_no", "institution_no", "transit_no", "sin", "cognito_sub"}


def _redact(d):
    if d is None:
        return None
    return {k: ("[REDACTED]" if k in SENSITIVE else v) for k, v in d.items()}
