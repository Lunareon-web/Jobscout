from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str

    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "gemma4-fast:latest"

    crawl_max_concurrent: int = 5
    crawl_politeness_delay: float = 2.0
    crawl_timeout: int = 20

    search_radius_km: int = 60
    search_center: str = "Düsseldorf"

    class Config:
        env_file = ".env"


settings = Settings()
