from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime

# --- Token & Auth Schemas ---
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None

# --- User Schemas ---
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    is_suspended: Optional[bool] = None

class UserOut(UserBase):
    id: int
    role: str
    is_suspended: bool
    created_at: datetime

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    email: EmailStr
    password: str

# --- Browser Profile Schemas ---
class BrowserProfileBase(BaseModel):
    name: str

class BrowserProfileOut(BrowserProfileBase):
    id: int
    user_id: int
    profile_path: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- Monitoring Job Schemas ---
class MonitoringJobBase(BaseModel):
    name: str
    target_url: str
    refresh_interval: int = Field(default=30, ge=5)
    expected_text: Optional[str] = None
    expected_element: Optional[str] = None
    expected_button: Optional[str] = None
    expected_url: Optional[str] = None
    expected_http_response: Optional[int] = None
    expected_title: Optional[str] = None
    max_retries: int = Field(default=10, ge=1)
    timeout: int = Field(default=30, ge=5)

class MonitoringJobCreate(MonitoringJobBase):
    pass

class MonitoringJobUpdate(BaseModel):
    name: Optional[str] = None
    target_url: Optional[str] = None
    refresh_interval: Optional[int] = None
    expected_text: Optional[str] = None
    expected_element: Optional[str] = None
    expected_button: Optional[str] = None
    expected_url: Optional[str] = None
    expected_http_response: Optional[int] = None
    expected_title: Optional[str] = None
    max_retries: Optional[int] = None
    timeout: Optional[int] = None
    status: Optional[str] = None # active, paused, finished

class MonitoringJobOut(MonitoringJobBase):
    id: int
    user_id: int
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- Worker Schemas ---
class WorkerOut(BaseModel):
    id: int
    name: str
    status: str
    current_job_id: Optional[int] = None
    browser_ws_url: Optional[str] = None
    host: Optional[str] = None
    port: Optional[str] = None
    last_ping: datetime

    class Config:
        from_attributes = True

# --- Session Schemas ---
class SessionOut(BaseModel):
    id: int
    user_id: int
    job_id: int
    worker_id: Optional[int] = None
    status: str
    screenshot_path: Optional[str] = None
    cdp_ws_url: Optional[str] = None
    created_at: datetime
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- Notification Settings Schemas ---
class NotificationSettingsBase(BaseModel):
    email_enabled: bool = False
    email_address: Optional[str] = None
    
    telegram_enabled: bool = False
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    
    discord_enabled: bool = False
    discord_webhook_url: Optional[str] = None
    
    slack_enabled: bool = False
    slack_webhook_url: Optional[str] = None
    
    webhook_enabled: bool = False
    webhook_url: Optional[str] = None

class NotificationSettingsUpdate(NotificationSettingsBase):
    pass

class NotificationSettingsOut(NotificationSettingsBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True

# --- Audit Log Schemas ---
class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    job_id: Optional[int] = None
    message: str
    level: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- System Settings Schemas ---
class SystemSettingsOut(BaseModel):
    key: str
    value: str

    class Config:
        from_attributes = True
