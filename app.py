from pydoc import describe
import gradio as gr
from main import Main
import streamlit as st
import os
import json

main = Main()

def parse_cv(cv):
    # Save the CV to a temporary file
    file_path = os.path.join("temp", cv.name)
    print(file_path)
    os.makedirs("temp", exist_ok=True)
    with open(file_path, "wb") as f:
        f.write(cv.getbuffer())
    return main.parse_cv(file_path)

# Streamlit app
st.title("CV Parser")
st.write("demo for a CV parser")

# upload file
uploaded_file = st.file_uploader("Upload a CV: .PDF, .TXT, or .DOCX", type=["pdf", "txt", "docx"])

if uploaded_file is not None:

    # get parsed data output
    parsed_data = parse_cv(uploaded_file)
    st.write("Parsed Data:")
    # convert to json file
    st.json(parsed_data)

    # save json output
    json_file_name = "parsed_resume.json"  
    main.save_parse_as_json(parsed_data, json_file_name)
    st.write(f"Output saved as {json_file_name}")

