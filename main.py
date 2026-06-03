from reader import ResumeReader
from parser_r import ResumeParser
from Models import Models
import json
import os


class Main:
    def __init__(self):
        # initialize models
        models = Models()
        ner, ner_dates, zero_shot_classifier = models.load_trained_models()
        # initialize instances
        self.reader = ResumeReader()
        self.parser = ResumeParser(ner, ner_dates, zero_shot_classifier) 

    def parse_cv(self, file_path):
         # read contents of resume 
        resume_lines = self.reader.read_file(file_path)
        # parse resume content using the initialized parser
        output = self.parser.parse(resume_lines)
        return output
        
    def save_parse_as_json(self, dict, file_name):
        print("***starting to save***")
        with open(file_name, 'w', encoding="utf-8") as f:
            json.dump(dict, f, indent=4, default=str, ensure_ascii=False) 