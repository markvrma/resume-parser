# Streamlit Application

## Introduction

This repository contains a Streamlit application for resume parsing.

## Prerequisites

Before running the application, ensure you have the following installed:

- Python 3.11
- pip package manager

## Installation

1. Clone the repository to your local machine:

    ```
    git clone https://github.com/markvrma/resume-parser.git
    ```

2. Navigate to the project directory:

    ```
    cd resume-parser
    ```

3. Install the required dependencies:

    ```
    pip install -r requirements.txt
    ```

## Usage

To run the Streamlit application, execute the following command:

  ```
  streamlit run app.py
  ```
Upload a pdf/doc/docx file to get the required json output

---

## Rewrite in progress

Audited this repo and found the parser does far less than its dependency list
suggests. Planning to gut it: drop the model stack, rebuild as a static web app
that scores a resume against a documented rubric instead of dumping raw sections
to JSON.
