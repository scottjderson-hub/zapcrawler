from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List, Optional

app = FastAPI(
    title="Mail Discovery Parser API",
    description="An API to parse email headers and extract unique email addresses.",
    version="1.0.0",
)

class EmailHeader(BaseModel):
    id: str
    subject: Optional[str] = None
    from_addr: Optional[str] = Field(None, alias="from")
    to_addr: Optional[List[str]] = Field(None, alias="to")
    cc: Optional[List[str]] = None
    bcc: Optional[List[str]] = None
    date: Optional[str] = None
    folder: str

class ParserRequest(BaseModel):
    headers: List[EmailHeader]

class ParserResponse(BaseModel):
    unique_emails: List[str]
    total_processed: int

@app.get("/health", tags=["Health Check"])
async def health_check():
    """Check the health of the service."""
    return {"status": "ok"}

@app.post("/parse", response_model=ParserResponse, tags=["Parsing"])
async def parse_headers(request: ParserRequest):
    """
    Accepts a list of email headers, parses them to extract unique email addresses.
    
    - **headers**: A list of email header objects.
    """
    unique_emails = set()
    
    for header in request.headers:
        if header.from_addr:
            unique_emails.add(header.from_addr)
        if header.to_addr:
            for email in header.to_addr:
                unique_emails.add(email)
        if header.cc:
            for email in header.cc:
                unique_emails.add(email)
        if header.bcc:
            for email in header.bcc:
                unique_emails.add(email)

    return {
        "unique_emails": list(unique_emails),
        "total_processed": len(request.headers),
    }
