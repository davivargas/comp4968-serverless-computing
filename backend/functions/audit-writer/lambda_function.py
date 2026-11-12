import json
import os

import boto3
from botocore.exceptions import ClientError

_table = None


def table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb").Table(os.environ["AUDIT_TABLE"])
    return _table


def lambda_handler(event, context=None):
    failures = []
    for rec in event.get("Records", []):
        try:
            e = json.loads(rec["body"])
            item = {
                "month": e["changedAt"][:7], "sk": f"{e['changedAt']}#{e['auditId']}", "auditId": e["auditId"], "table": e["table"],
                "recordId": e["recordId"], "action": e["action"], "changedAt": e["changedAt"],
                "oldValues": json.dumps(e.get("oldValues")), "newValues": json.dumps(e.get("newValues")),
            }
            if e.get("changedBy") is not None:
                item["changedBy"] = int(e["changedBy"])
                item["changedByName"] = e.get("changedByName")
            try:
                table().put_item(Item=item, ConditionExpression="attribute_not_exists(sk)")
            except ClientError as err:
                if err.response["Error"]["Code"] != "ConditionalCheckFailedException":
                    raise
        except Exception:
            import traceback
            traceback.print_exc()
            failures.append({"itemIdentifier": rec.get("messageId")})
    return {"batchItemFailures": failures}
