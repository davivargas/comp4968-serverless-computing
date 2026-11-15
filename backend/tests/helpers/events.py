import json

"""Builders for the events AWS sends to our Lambdas, so tests don't
repeat the same nested dicts.
"""


def api_event(method, resource, *, role=None, sub="sub-test", path=None,
              query=None, body=None):
    """An API Gateway proxy event with Cognito claims. role sets the
    X-Active-Role header; body is JSON-encoded."""
    headers = {"X-Active-Role": role} if role else {}
    return {
        "httpMethod": method,
        "resource": resource,
        "headers": headers,
        "pathParameters": path,
        "queryStringParameters": query,
        "body": None if body is None else json.dumps(body),
        "requestContext": {"authorizer": {"claims": {"sub": sub}}},
    }


def sqs_event(*bodies):
    """An SQS trigger event with one record per body. Dict bodies are
    JSON-encoded; messageIds are msg-0, msg-1, ..."""
    records = []
    for i, body in enumerate(bodies):
        if not isinstance(body, str):
            body = json.dumps(body)
        records.append({"messageId": f"msg-{i}", "body": body,
                        "eventSource": "aws:sqs"})
    return {"Records": records}
