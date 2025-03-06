import streamlit as st
import requests
import sounddevice as sd
import numpy as np
import wave
import os

# FastAPI Backend URL
BACKEND_URL = "http://127.0.0.1:8000"

# Page Configuration
st.set_page_config(page_title="AI Interviewer", layout="wide")

st.title("📄 AI Resume Interviewer")

# File Upload
uploaded_file = st.file_uploader("Upload your Resume (PDF)", type=["pdf"])

if uploaded_file:
    st.info("Processing your resume... Please wait.")
    files = {"file": uploaded_file.getvalue()}
    
    # Send to FastAPI backend
    response = requests.post(f"{BACKEND_URL}/upload", files=files)
    
    if response.status_code == 200:
        data = response.json()
        questions = data.get("questions", [])

        if questions:
            st.success("Interview questions generated!")

            # Session state for navigation
            if "question_idx" not in st.session_state:
                st.session_state["question_idx"] = 0
                st.session_state["scores"] = [0] * len(questions)  # Store scores for each question

            question_idx = st.session_state["question_idx"]

            col1, col2 = st.columns(2)

            with col1:
                st.subheader("📝 Question")
                st.write(questions[question_idx])

            with col2:
                st.subheader("🎤 Your Response")

                def record_audio(duration=30, sample_rate=44100):
                    st.write("🎙️ Recording...")
                    audio_data = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=2, dtype=np.int16)
                    sd.wait()
                    st.success("✅ Recording complete!")

                    # Save as WAV file
                    filename = f"response_{question_idx}.wav"
                    with wave.open(filename, "wb") as wf:
                        wf.setnchannels(2)
                        wf.setsampwidth(2)
                        wf.setframerate(sample_rate)
                        wf.writeframes(audio_data.tobytes())

                    return filename

                if st.button("🎤 Start Recording", key=f"record_{question_idx}"):
                    audio_file = record_audio()
                    st.audio(audio_file, format="audio/wav")

                    # Send recording to backend
                    with open(audio_file, "rb") as f:
                        response = requests.post(f"{BACKEND_URL}/evaluate", files={"file": f})

                    if response.status_code == 200:
                        score = response.json().get("score", 0)
                        st.session_state["scores"][question_idx] = score
                        st.success(f"✅ Your response scored: {score}/10")

                # Navigation Buttons
                col3, col4 = st.columns(2)
                with col3:
                    if st.button("⬅️ Previous", disabled=(question_idx == 0)):
                        st.session_state["question_idx"] = max(0, question_idx - 1)
                        st.rerun()

                with col4:
                    if st.button("➡️ Next", disabled=(question_idx == len(questions) - 1)):
                        st.session_state["question_idx"] = min(len(questions) - 1, question_idx + 1)
                        st.rerun()

            # Show Final Score
            if question_idx == len(questions) - 1:
                total_score = sum(st.session_state["scores"])
                st.subheader(f"🏆 Your Final Interview Score: {total_score} / 50")
    else:
        st.error("Failed to process resume. Please try again.")
