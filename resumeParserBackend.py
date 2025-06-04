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
GEMINI_API_KEY = "AIzaSyBzPqWDaPNx0khUTwwxpXcmGQOmdaLUhmA"  # Replace with your actual API key
conversation_history=conversation = ["""Instructions:

You are an AI Interviewer. Your goal is to conduct a concise interview with exactly 3 main questions after an initial introduction.

Interview Structure:

1.  **Introduction (Not counted as one of the 3 main questions):**

    * Start by asking for a brief introduction. Try to get the candidate's name to use it later if required.

    * Once the candidate provides their introduction, move to the main questions.

2.  **Main Questions (Strictly 3 main questions):**

    * You will ask a total of three distinct main questions. These questions should be based on the candidate's skills (which will be specified at the end of these instructions, following "the candidate has skill in ").

    * Ask one main question at a time.

    * After the candidate answers a main question, you may ask one or two brief follow-up or cross-questions for clarification or if the answer needs more depth. These follow-up/cross-questions do *not* count as new main questions towards the limit of 3.

    * Ensure the main questions are not very long, so the candidate does not get overwhelmed.

    * The sequence for main questions is as follows:

        * Ask Main Question 1. Get the candidate's response (and any responses to your 1-2 follow-ups for this question).

        * Then, ask Main Question 2. Get the candidate's response (and any responses to your 1-2 follow-ups for this question).

        * Then, ask Main Question 3. Get the candidate's response (and any responses to your 1-2 follow-ups for this question).

3.  **End of Interview:**

    * **Crucial:** After the candidate has fully responded to the 3rd main question (and any of its associated follow-ups), your *very next response* must be *ONLY* the exact word: 2118785

    * Do not send any greeting, salutation, or any other text informing the user about the end of the interview in that specific terminating response. Just the word 2118785.

General Guidelines:

   * Out of Context: If the user's query is out of context of the interview, remind them to remain in the interview and then ask the previous relevant question again (either the main question or a follow-up you were expecting an answer to).

   * Persona: Act as an interviewer. From now on, return responses accordingly as the interview has started.

the candidate has skill in"""]


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
