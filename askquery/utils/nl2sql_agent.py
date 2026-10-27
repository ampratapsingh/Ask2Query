import os
from openai import OpenAI
from dotenv import load_dotenv

from Ask2Query.prompts.xiyan_template_prompt import xiyan_template_en

load_dotenv()

class XiYanAgent:
    def __init__(self):
        self.client = OpenAI(
        base_url=os.environ.get("MODELSCOPE_API_BASE"),# ModelScope Inference API Base URL
        api_key=os.environ.get("MODELSCOPE_API_KEY"), # ModelScope API Key
    )

    def generate_sql(self, question, evidence, schema):
        prompt_raw = xiyan_template_en.format(
            dialect="SQLite",
            question=question,
            db_schema=schema,
            evidence= None
        )
        
        prompt_with_evidence = xiyan_template_en.format(
            dialect="SQLite",
            question=question,
            db_schema=schema,
            evidence= evidence
        )
        
        response_raw = self.client.chat.completions.create(
            model='XGenerationLab/XiYanSQL-QwenCoder-32B-2504', # ModelScope Model-Id
            messages=[
                {
                    'role': 'system',
                    'content': 'You are a helpful assistant to generate SQL queries bases on the database schema and the user question.'
                },
                {
                    'role': 'user',
                    'content': prompt_raw
                }
            ]
        )
        sql_raw = response_raw.choices[0].message.content
        
        response_clarified = self.client.chat.completions.create(
            model='XGenerationLab/XiYanSQL-QwenCoder-32B-2504',
            messages=[
                {
                    'role': 'system',
                    'content': 'You are a helpful assistant to generate SQL queries bases on the database schema and the user question.'
                },
                {
                    'role': 'user',
                    'content': prompt_with_evidence
                }
            ]
        )
        sql_clarified = response_clarified.choices[0].message.content
        return sql_raw, sql_clarified