from transformers import AutoTokenizer, AutoModelForTokenClassification, AutoModelForSequenceClassification
from transformers import pipeline

class Models:

    def load_trained_models(self):
        #Zero Shot Classification
        # self.zero_shot_classifier = pipeline("zero-shot-classification", model='facebook/bart-large-mnli')
        self.zero_shot_classifier = pipeline("zero-shot-classification", model='valhalla/distilbart-mnli-12-6')


        return self.zero_shot_classifier
