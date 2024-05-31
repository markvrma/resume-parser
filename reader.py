import re
import os
import logging
import pdfplumber
import fitz
import docx

class ResumeReader:

    def convert_docx_to_txt(self, docx_file,docx_parser):
        try:
            doc = docx.Document(docx_file)

            raw_text = ""

            for para in doc.paragraphs:
                raw_text += para.text + "\n"  

            full_string = re.sub(r'\n+', '\n', raw_text)
            full_string = full_string.replace("\r", "\n")
            full_string = full_string.replace("\t", " ")
            full_string = full_string.replace("\uf0b7", " ")
            full_string = re.sub(r"\(cid:\d{0,3}\)", " ", full_string)
            full_string = re.sub(r'• ', " ", full_string)

            resume_lines = full_string.splitlines(True)
            resume_lines = [re.sub('\s+', ' ', line.strip()) for line in resume_lines if line.strip()]

            return resume_lines, raw_text 
        
        except Exception as e:
            logging.error('Error in docx file:: ' + str(e))
            return [], " "

    def convert_pdf_to_txt(self, pdf_file):

        pdf = pdfplumber.open(pdf_file)
        raw_text= ""
        with fitz.open(pdf_file) as doc:
            for page in doc:
                raw_text += page.get_text()

        pdf.close()                
      
        try:
            full_string = re.sub(r'\n+', '\n', raw_text)
            full_string = full_string.replace("\r", "\n")
            full_string = full_string.replace("\t", " ")

            # Remove awkward LaTeX bullet characters
            full_string = re.sub(r"\uf0b7", " ", full_string)
            full_string = re.sub(r"\(cid:\d{0,3}\)", " ", full_string)
            full_string = re.sub(r'• ', " ", full_string)

            # Split text blob into individual lines
            resume_lines = full_string.splitlines(True)

            # Remove empty strings and whitespaces
            resume_lines = [re.sub('\s+', ' ', line.strip()) for line in resume_lines if line.strip()]
           
            return resume_lines, raw_text 
        except Exception as e:
            logging.error('Error in docx file:: ' + str(e))
            return [], " "

    def read_file(self, file,docx_parser = "tika"):

        print("Reading the Resume...")
        file = os.path.join(file)
        if file.endswith('docx') or file.endswith('doc'):
            resume_lines, raw_text = self.convert_docx_to_txt(file,docx_parser)
        elif file.endswith('pdf'):
            resume_lines, raw_text = self.convert_pdf_to_txt(file)
        elif file.endswith('txt'):
            with open(file, 'r', encoding='utf-8') as f:
                resume_lines = f.readlines()

        else:
            resume_lines = None
        
        print(resume_lines)
        
      
        return resume_lines 