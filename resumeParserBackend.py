from fastapi import FastAPI, File, UploadFile
import pdfplumber
import spacy
import uvicorn
import requests
import json
from google import genai
import speech_recognition as sr
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
conversation_history=["Instructions:"+
"Ask him question one at a time and also cross qusetion just like an interview"
+"Return plain text and avoid asking question which is difficult to read out"+
"If user query is out of context of the interview, remind him to remain in interview ans ask previous question again"+
"Total 5 questions only then end the interview"+
"The Question should not be very long so that the candidate may not get overwhelmed"+
"Ask for a brief introduction, to get the name of the user and then use it later on if required"
"Act as an interver and from now on return response accordingly as interview has started"
"the candidate has skill in "
]

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

    return " ".join(extracted_skills)


import json
import re
# def interview(mssg):
#     client = genai.Client(api_key=GEMINI_API_KEY)
    
#     if mssg:  # Only add to conversation if there's a user message
#         conversation_history.append("User_response:" + mssg)
    
#     response = client.models.generate_content(
#         model="gemini-2.0-flash",
#         contents=conversation_history
#     )
    
#     interviewer_response = response.text
#     conversation_history.append("gemini_response:" + interviewer_response) 
    
#     # Return both the user's transcribed message and the interviewer's response
#     return {
#         "Response": interviewer_response,
#         "User_response": mssg if mssg else ""
#     }


@app.post("/upload")
async def upload_resume(file: UploadFile = File(...)):
    try:
        text = extract_text_from_pdf(file.file)
        if not text:
            return {"error": "No text could be extracted. Ensure the PDF contains selectable text."}

        skills = extract_skills(text)
        if not skills:
            return {"error": "No relevant skills found in the resume."}

        conversation_history[0]=conversation_history[0]+skills
    except Exception as e:
        return {"error": str(e)}
    return interview("")
    
# Modified transcribe endpoint to handle WAV files better

import wave
import os
import tempfile
import uuid

@app.post("/transcribe")
async def evaluate_audio(file: UploadFile = File(...)):
    # Create unique temporary filename
    temp_dir = tempfile.gettempdir()
    unique_id = uuid.uuid4()
    temp_in_path = os.path.join(temp_dir, f"input_{unique_id}.webm")
    temp_out_path = os.path.join(temp_dir, f"output_{unique_id}.wav")
    
    try:
        # Save the uploaded file
        content = await file.read()
        with open(temp_in_path, "wb") as f:
            f.write(content)
        
        print(f"Received audio file: {file.filename}, size: {len(content)} bytes")
        
        # Use speech recognition
        recognizer = sr.Recognizer()
        
        try:
            with sr.AudioFile(temp_in_path) as source:
                # Adjust for ambient noise
                recognizer.adjust_for_ambient_noise(source)
                # Record audio with longer timeout and phrase threshold
                audio = recognizer.record(source)
            
            # Try to recognize speech with increased timeout
            response_text = recognizer.recognize_google(
                audio, 
                language="en-US", 
                show_all=False
            )
            print(f"Transcribed text: {response_text}")
            
            result = interview(response_text)
            
            result["transcribed_text"] = response_text
            
            return result
            
        except sr.UnknownValueError as e:
            print(f"Speech recognition error: {str(e)}")
            return {"error": "Speech not recognized. Please speak clearly and try again."}
        except sr.RequestError as e:
            print(f"Speech recognition service error: {str(e)}")
            return {"error": "Speech-to-text service unavailable"}
        except Exception as e:
            print(f"Error processing audio file: {str(e)}")
            return {"error": f"Error processing audio: {str(e)}"}
    finally:
        # Clean up the temporary files
        for path in [temp_in_path, temp_out_path]:
            if os.path.exists(path):
                os.remove(path)
                print(f"Removed temporary file: {path}")

# Modified interview function to better format responses
def interview(mssg):
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    if mssg:  
        conversation_history.append("User_response:" + mssg)
    
    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=conversation_history
        )
        
        interviewer_response = response.text
        conversation_history.append("gemini_response:" + interviewer_response) 
        
        return {
            "Response": interviewer_response,
            "User_response": mssg if mssg else ""
        }
    except Exception as e:
        print(f"Error generating response: {str(e)}")
        return {
            "Response": "I apologize, but I'm having trouble processing your response. Let's continue with the interview. Could you please respond to my previous question?",
            "User_response": mssg if mssg else "",
            "error": str(e)
        }
# @app.get("/calculate_score")
# def score():
#     client=genai.Client(api_key=GEMINI_API_KEY)
#     content = [
#         "Here is the conversational history. Each question carries 10 marks. Evaluate and just return the final score of the user in text:"
#     ] + conversation_history
#     response=client.models.generate_content(
#         model="gemini-2.0-flash",
#         content=content
#     )
#     return {"Score":response.text}

   
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
