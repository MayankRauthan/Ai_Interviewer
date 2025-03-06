from fastapi import FastAPI, File, UploadFile
import pdfplumber
import spacy
import ast  # Add at the top
import uvicorn
import requests
import json
import openai
import speech_recognition as sr
from pydantic import BaseModel
from google.generativeai import configure, GenerativeModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load spaCy model
nlp = spacy.load("en_core_web_sm")

# Predefined skills list
SKILLS = {
    "Machine Learning", "Deep Learning", "Python", "Java", "C++", "Android", "Spring Boot",
    "Data Science", "NLP", "TensorFlow", "Keras", "Pandas", "NumPy", "SQL", "MongoDB",
    "Docker", "Kubernetes", "Git", "REST APIs", "FastAPI", "Flask", "React", "Node.js",
    "JavaScript", "TypeScript", "GraphQL", "AWS", "Azure", "GCP", "Firebase", "Flutter",
    "Kotlin", "Django", "PyTorch", "Computer Vision", "Hugging Face", "Transformers",
    "Speech Recognition", "LLMs", "Prompt Engineering", "CSS", "Fastapi", "Postgres",
    "HTML", "gradio", "Rest"
}

# Google Gemini API Details
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
GEMINI_API_KEY = "AIzaSyBMV5Q88ds0XmMGP2nPSvyFUCWSTbzpeF0"  # Replace with your actual API key


def extract_text_from_pdf(file):
    """Extract text from a PDF file."""
    text = []
    with pdfplumber.open(file) as pdf:
        for page in pdf.pages:
            extracted_text = page.extract_text()
            if extracted_text:
                text.append(extracted_text.strip())
    return "\n".join(text) if text else ""


def extract_skills(text):
    """Extract only skills from the resume using spaCy + predefined skills set."""
    doc = nlp(text)
    extracted_skills = set()

    for token in doc:
        if token.text in SKILLS:
            extracted_skills.add(token.text)

    return list(extracted_skills)


import json
import re

def generate_questions(skills):
    """Send skills to Gemini API and get 5 interview questions."""
    prompt = f"""Generate 5 technical interview questions  (just descibe , difference etc) for a candidate with the following skills: {', '.join(skills)}.
            The questions should be of 1 or 2 line max and must be formatted as follows in json format, nothing extra just json:
            ```json
            {{
                "questions": [
                    "Question 1",
                    "Question 2",
                    "Question 3",
                    "Question 4",
                    "Question 5"
                ]
            }}
            ```"""

    headers = {"Content-Type": "application/json"}
    data = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        response = requests.post(f"{GEMINI_API_URL}?key={GEMINI_API_KEY}", json=data, headers=headers)
        response_data = response.json()

        # Extract text from Gemini response
        if "candidates" in response_data:
            raw_text = response_data["candidates"][0]["content"]["parts"][0]["text"]

            # **Remove triple backticks and extract only the JSON part**
            json_match = re.search(r'```json\n(.*?)\n```', raw_text, re.DOTALL)
            if json_match:
                json_text = json_match.group(1)  # Extract the JSON content

                # Convert string to a proper JSON object
                questions_json = json.loads(json_text)
                return questions_json  # Return parsed JSON

        return {"error": "No valid JSON found in response", "raw_response": raw_text}

    except Exception as e:
        return {"error": str(e)}


@app.post("/upload")
async def upload_resume(file: UploadFile = File(...)):
    try:
        text = extract_text_from_pdf(file.file)
        if not text:
            return {"error": "No text could be extracted. Ensure the PDF contains selectable text."}

        skills = extract_skills(text)
        if not skills:
            return {"error": "No relevant skills found in the resume."}

        questions = generate_questions(skills)

        return questions
    except Exception as e:
        return {"error": str(e)}
@app.post("/evaluate")
async def evaluate_audio(file: UploadFile = File(...)):
    # Save audio file
    filename = "temp_audio.wav"
    with open(filename, "wb") as f:
        f.write(file.file.read())

    # Convert speech to text
    recognizer = sr.Recognizer()
    with sr.AudioFile(filename) as source:
        audio = recognizer.record(source)

    try:
        response_text = recognizer.recognize_google(audio)
    except sr.UnknownValueError:
        return {"score": 0, "error": "Speech not recognized"}
    except sr.RequestError:
        return {"score": 0, "error": "Speech-to-text service unavailable"}

    # Evaluate using Gemini API
    prompt = f"Evaluate this interview response and rate it out of 10: {response_text}"

    headers = {"Content-Type": "application/json"}
    data = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        response = requests.post(f"{GEMINI_API_URL}?key={GEMINI_API_KEY}", json=data, headers=headers)
        response_data = response.json()

        # Extract text from Gemini response
        if "candidates" in response_data:
            raw_text = response_data["candidates"][0]["content"]["parts"][0]["text"]

            # Extract only the numeric score from response
            match = re.search(r'\b(\d{1,2})\b', raw_text)  # Looks for a number (1-2 digits)
            score = int(match.group(1)) if match else 0  # Default to 0 if no number found

            return {"score": score}

        return {"score": 0, "error": "Invalid response from API", "raw_response": raw_text}

    except Exception as e:
        return {"score": 0, "error": str(e)}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
