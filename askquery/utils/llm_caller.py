import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

class LLMCaller:
    def __init__(self, model):
        self.model = model
        self.input_tokens = 0 
        self.output_tokens = 0
        self.total_tokens_used = 0  
        api_key = os.getenv("OPENAI_API_KEY")
        if model == 'qwen':
            self.model = "qwen3-235b-a22b-instruct-2507" 
            api_key = os.getenv("DASHSCOPE_API_KEY")
        elif model == 'claude':
            self.model = "claude-sonnet-4-5-20250929" 
        elif model == 'gpt':
            self.model = "gpt-5-2025-08-07" 
        elif model == 'gemini':
            self.model = "gemini-2.5-pro"
        else:
            raise ValueError(f"Model {model} not recognized. Available models: 'qwen', 'claude', 'gpt', 'gemini'")
        
        # initialize a openai-like client via dashscope
        self.client = OpenAI(
            api_key=api_key, 
            base_url=os.getenv("OPENAI_API_BASE")
        )

    def call(self, query, temperature = 0):
        print(f"Calling {self.model} with query: {query}")
        if self.model.startswith("claude"):
            max_tokens = 50000
        else:
            max_tokens = None
        response = self.client.chat.completions.create(
            model=self.model,
            messages=query,
            temperature = temperature,
            max_tokens=max_tokens
        )
        print(f"Response: {response}")
        if response.usage:
            self.total_tokens_used += response.usage.total_tokens
            self.input_tokens += response.usage.prompt_tokens
            self.output_tokens += response.usage.completion_tokens
        return response.choices[0].message.content


    def get_total_tokens_used(self):
        return self.total_tokens_used, self.input_tokens, self.output_tokens

