"""Testeo unitario de la función lambda"""
import json
from unittest.mock import patch
import os
from moto import mock_sns
import pytest

from functions.internal_subscriber import function as func_subscriber
from functions.internal_publisher import function as func_prod
import boto3


with open('tests/events/publisher_invoked.json', 'r', encoding="utf-8") as f:
    publisher_invoked_event = json.loads(f.read())

with open('tests/events/incoming_message.json', 'r', encoding="utf-8") as f:
    incoming_message_event = json.loads(f.read())

class TestServiceHandler:
    """Clase para el manejo de evento y contexto"""
    @pytest.fixture
    def publisher_invoked(self):
        """Generación de evento con json"""
        _ = self
        return publisher_invoked_event

    @pytest.fixture
    def incoming_message(self):
        """Generación de evento con json"""
        _ = self
        return incoming_message_event

    @pytest.fixture
    def context(self):
        """Generación de contexto"""
        return self

    @pytest.mark.parametrize("topic_arn, expected_status_code", [
        ("some-topic", 200),
        ("invalid-topic", 500)
    ])
    @mock_sns
    def test_publisher(self, publisher_invoked, topic_arn, expected_status_code):
        sns = boto3.client("sns", region_name="us-east-1")
        if topic_arn == "some-topic":
            topic = sns.create_topic(Name=topic_arn)
            topic_arn = topic["TopicArn"]

        with patch.dict(os.environ, {"topicArn": topic_arn, "region": "us-east-1"}):
            context = type("Context", (), {"function_name": "test_publisher"})
            response = func_prod.lambda_handler(publisher_invoked, context)
            data = json.loads(response["body"])["sentMessage"]

            assert response["statusCode"] == expected_status_code
            assert data is not None


    def test_subscriber(self, incoming_message, context):
        """llamada de lambda con evento y contexto"""
        _ = self
        context.function_name = 'test_subscriber'
        response = func_subscriber.lambda_handler(incoming_message, context)
        messages: dict = json.loads(response["body"])["receivedMessages"]
        msgs_count = len(messages)
        assert response["statusCode"] == 200
        assert msgs_count > 0
