from Models import Models
from segmenterr import ResumeSegmenter
from datetime import datetime
from dateutil import parser
import re
from string import punctuation

class ResumeParser:
    '''
    init: intializes the models, segmenter, ner, ner_dates, zero_shot_classifier, and tagger
    '''
    def __init__(self, ner, ner_dates, zero_shot_classifier): #,tagger
        self.models = Models()
        self.segmenter = ResumeSegmenter(zero_shot_classifier)
        # self.ner, self.ner_dates, self.zero_shot_classifier, self.tagger = ner, ner_dates, zero_shot_classifier, tagger 
        self.ner, self.ner_dates, self.zero_shot_classifier = ner, ner_dates, zero_shot_classifier
        self.parsed_cv = {}

    def parse(self, resume_lines):
        resume_segments = self.segmenter.segment(resume_lines)
        print("***Parsing the Resume...*** ")
        # going through each segment of the resume
        for segment_name in resume_segments:
            print(segment_name)
            if segment_name == "work_and_employment":
                resume_segment = resume_segments[segment_name]
                self.parse_job_history(resume_segment)
            elif segment_name == "contact_info":
                contact_info = resume_segments[segment_name]
                self.parse_contact_info(contact_info)
            elif segment_name == "education_and_training":
                education_and_training = resume_segments[segment_name]
                self.parse_education(education_and_training)
            elif segment_name == "skills":
                skills_header = resume_segments[segment_name]
                self.parse_skills(skills_header)
            elif segment_name == "accomplishments":
                accomplishments_header = resume_segments[segment_name]
                self.parse_accomplishments(accomplishments_header)
            elif segment_name == "misc":
                misc_header = resume_segments[segment_name]
                self.parse_misc(misc_header)
                print("**** SKILLS HEADER ****")
        return self.parsed_cv

    def parse_education(self, education_and_training):
        self.parsed_cv['Education'] = education_and_training
    
    def parse_accomplishments(self, accomplishments):
        self.parsed_cv['Accomplishments'] = accomplishments
    
    def parse_misc(self, misc):
        self.parsed_cv['Misc'] = misc

    def parse_skills(self, skills_header):
        self.parsed_cv['Skills'] = skills_header

    def parse_contact_info(self, contact_info):
        contact_info_dict = {}
        email = self.find_contact_email(contact_info)
        contact_info_dict["Email"] = email
        contact_info_dict["Contact"] = contact_info
        self.parsed_cv['Contact Info'] = contact_info_dict

    def find_contact_email(self, items):
        for item in items: 
            match = re.search(r'[\w.+-]+@[\w-]+\.[\w.-]+', item)
            if match:
                return match.group(0)
        return ""

    def parse_job_history(self, resume_segment):
        self.parsed_cv["Job History"] = resume_segment

