from transformers import AutoTokenizer, AutoModelForTokenClassification, AutoModelForSequenceClassification
from transformers import pipeline
import pickle

class Models:

    def load_trained_models(self, pickle=False):
        #Zero Shot Classification
        # self.zero_shot_classifier = pipeline("zero-shot-classification", model='facebook/bart-large-mnli')
        self.zero_shot_classifier = pipeline("zero-shot-classification", model='valhalla/distilbart-mnli-12-6')


        if pickle:
            self.pickle_models()
        
        return self.zero_shot_classifier
    
    def pickle_models(self):
        self.pickle_it(self.zero_shot_classifier, "zero_shot_classifier_6")

    def pickle_it(self, obj, file_name):
        with open(f'{file_name}.pickle', 'wb') as f:
            pickle.dump(obj, f)

    def unpickle_it(self, file_name):
        with open(f'{file_name}.pickle', 'rb') as f:
            return pickle.load(f)