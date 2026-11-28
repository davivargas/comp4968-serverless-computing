"""The alarms in template.yaml: every Lambda is watched, every alarm emails the shared IT inbox,
and nothing is left out of the email path."""
import pathlib

import pytest
import yaml

TEMPLATE = pathlib.Path(__file__).resolve().parents[2] / "template.yaml"


class _Loader(yaml.SafeLoader):
    """Reads CloudFormation's !Ref / !Sub / !GetAtt short forms as plain data."""


def _tag(loader, suffix, node):
    if isinstance(node, yaml.ScalarNode):
        return {suffix: loader.construct_scalar(node)}
    if isinstance(node, yaml.SequenceNode):
        return {suffix: loader.construct_sequence(node, deep=True)}
    return {suffix: loader.construct_mapping(node, deep=True)}


_Loader.add_multi_constructor("!", _tag)


@pytest.fixture(scope="module")
def template():
    return yaml.load(TEMPLATE.read_text(), Loader=_Loader)


@pytest.fixture(scope="module")
def alarms(template):
    return {k: v["Properties"] for k, v in template["Resources"].items() if v["Type"] == "AWS::CloudWatch::Alarm"}


def _functions(template):
    return [k for k, v in template["Resources"].items() if v["Type"] == "AWS::Serverless::Function"]


def test_every_function_except_db_init_has_an_errors_alarm(template, alarms):
    watched = {a["Dimensions"][0]["Value"]["Ref"] for a in alarms.values()
               if a["MetricName"] == "Errors" and a["Namespace"] == "AWS/Lambda"}
    assert watched == {f for f in _functions(template) if f != "DbInitFunction"}


def test_every_alarm_emails_the_alerts_topic_for_alarm_and_ok(alarms):
    assert alarms
    for name, a in alarms.items():
        assert a["AlarmActions"] == [{"Ref": "AlertsTopic"}], name
        assert a["OKActions"] == [{"Ref": "AlertsTopic"}], name


def test_a_quiet_period_is_not_an_alarm(alarms):
    for name, a in alarms.items():
        assert a["TreatMissingData"] == "notBreaching", name


def test_both_dead_letter_queues_are_watched(alarms):
    queues = {a["Dimensions"][0]["Value"]["GetAtt"] for a in alarms.values() if a["Namespace"] == "AWS/SQS"}
    assert queues == {"AuditDeadLetterQueue.QueueName", "NotificationDeadLetterQueue.QueueName"}


def test_the_api_database_and_schedules_are_watched(alarms):
    seen = {(a["Namespace"], a["MetricName"]) for a in alarms.values()}
    assert {("AWS/ApiGateway", "5XXError"), ("AWS/ApiGateway", "Latency"), ("AWS/Lambda", "Throttles"),
            ("AWS/Scheduler", "TargetErrorCount"), ("AWS/RDS", "CPUUtilization"), ("AWS/RDS", "FreeStorageSpace"),
            ("AWS/RDS", "FreeableMemory"), ("AWS/RDS", "DatabaseConnections")} <= seen


def test_the_api_metric_uses_the_name_the_api_is_given(template, alarms):
    api = template["Resources"]["Api"]["Properties"]["Name"]
    for a in alarms.values():
        if a["Namespace"] == "AWS/ApiGateway":
            assert a["Dimensions"] == [{"Name": "ApiName", "Value": api}]


def test_the_alerts_topic_goes_to_the_alert_email_parameter(template):
    sub = template["Resources"]["AlertsSubscription"]["Properties"]
    assert sub["Protocol"] == "email" and sub["Endpoint"] == {"Ref": "AlertEmail"}
    assert sub["TopicArn"] == {"Ref": "AlertsTopic"}
    assert template["Parameters"]["AlertEmail"]["Default"] == "group1.timely.demo@gmail.com"


def test_only_cloudwatch_may_publish_to_the_alerts_topic_and_it_is_not_encrypted(template):
    topic = template["Resources"]["AlertsTopic"]["Properties"]
    assert "KmsMasterKeyId" not in topic  # CloudWatch cannot publish to a topic with an AWS-managed key
    [stmt] = template["Resources"]["AlertsTopicPolicy"]["Properties"]["PolicyDocument"]["Statement"]
    assert stmt["Principal"] == {"Service": "cloudwatch.amazonaws.com"} and stmt["Action"] == "sns:Publish"
    assert stmt["Condition"]["StringEquals"]["aws:SourceAccount"] == {"Ref": "AWS::AccountId"}
