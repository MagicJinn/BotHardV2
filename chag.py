import numpy as np
import tensorflow as tf
import os
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import Dense, LSTM, Embedding
from tensorflow.keras.preprocessing.text import Tokenizer
from tensorflow.keras.preprocessing.sequence import pad_sequences
import re
import time
import pickle
from flask import Flask, request, jsonify

app = Flask(__name__)

class MessageLearner:
    def __init__(self, max_words=10000, max_sequence_length=30):
        self.max_words = max_words
        self.max_sequence_length = max_sequence_length
        self.tokenizer = Tokenizer(num_words=max_words, oov_token="<OOV>")
        self.model = None
        self.messages = []
        self.previous_message = None
        self.current_message = None
        self.messages_since_last_training = 0
        self.messages_since_last_save = 0
        self.last_save_time = time.time()
        self.min_messages_for_training = 2
        self.create_model(max_words)

    def add_period(self, text):
        if not text.endswith(('.', '?', '!')):
            text += '.'
        return text

    def preprocess_message(self, message):
        message = re.sub(r'[^a-zA-Z0-9\s.?!]', '', message.lower())
        sentences = re.split(r'(?<=[.!?])\s+', message)
        return ' '.join(self.add_period(sentence) for sentence in sentences)

    def add_message(self, message):
        preprocessed = self.preprocess_message(message)
        if self.previous_message is None:
            self.previous_message = preprocessed
        else:
            self.current_message = preprocessed
            paired_message = f"{self.previous_message} {self.current_message}"
            self.messages.append(paired_message)
            self.previous_message = self.current_message
            self.current_message = None
            
            with open('training_data.txt', 'a') as f:
                f.write(paired_message + '\n')
            
            self.messages_since_last_training += 1
            self.messages_since_last_save += 1
            
            if self.messages_since_last_training >= self.min_messages_for_training:
                self.train(save_after_training=True)
                self.messages_since_last_training = 0
            else:
                self.check_save_conditions()

        return "Message added successfully"

    def check_save_conditions(self):
        current_time = time.time()
        if (current_time - self.last_save_time >= 60 and self.messages_since_last_save > 0) or self.messages_since_last_save >= 10:
            self.save_model()
            self.last_save_time = current_time
            self.messages_since_last_save = 0

    def save_model(self):
        if self.model and self.tokenizer.word_index:
            self.model.save('message_learner_model.keras')
            with open('tokenizer.pickle', 'wb') as handle:
                pickle.dump(self.tokenizer, handle, protocol=pickle.HIGHEST_PROTOCOL)
            print("Model and tokenizer saved.")
        else:
            print("Model or tokenizer not initialized. Cannot save.")

    def load_model(self):
        try:
            self.model = tf.keras.models.load_model('message_learner_model.keras')
            with open('tokenizer.pickle', 'rb') as handle:
                self.tokenizer = pickle.load(handle)
            print("Model and tokenizer loaded.")
            return True
        except:
            print("No saved model found or error loading. A new model will be created when training.")
            return False
        
    def create_model(self, total_words):
        self.model = Sequential([
            Embedding(total_words, 100, input_length=self.max_sequence_length-1),
            LSTM(150, return_sequences=True),
            LSTM(100),
            Dense(total_words, activation='softmax')
        ])
        self.model.compile(loss='sparse_categorical_crossentropy', optimizer='adam', metrics=['accuracy'])

    def train(self, epochs=20, batch_size=64, save_after_training=True):
        if len(self.messages) < 2:
            print("Not enough messages to train on.")
            return "Not enough messages to train on."
        
        self.tokenizer.fit_on_texts(self.messages)
        total_words = len(self.tokenizer.word_index) + 1
        print(f"Total unique words: {total_words}")

        input_sequences = []
        for message in self.messages:
            token_list = self.tokenizer.texts_to_sequences([message])[0]
            for i in range(1, len(token_list)):
                n_gram_sequence = token_list[:i+1]
                input_sequences.append(n_gram_sequence)

        if not input_sequences:
            print("No valid sequences to train on.")
            return "No valid sequences to train on."

        self.max_sequence_length = min(max([len(x) for x in input_sequences]), self.max_sequence_length)
        input_sequences = pad_sequences(input_sequences, maxlen=self.max_sequence_length, padding='pre')

        X, y = input_sequences[:, :-1], input_sequences[:, -1]
        y = np.array([self.tokenizer.word_index.get(self.tokenizer.index_word.get(i, ''), 0) for i in y])

        self.create_model(total_words)

        history = self.model.fit(X, y, epochs=epochs, batch_size=batch_size, verbose=1)
        
        if save_after_training:
            self.save_model()
        
        return "Training completed successfully"

    def generate_text(self, seed_text, next_words=20):
        if not self.model or not self.tokenizer.word_index:
            return "Model not trained or no data available. Please provide some training data."
        
        seed_text = self.preprocess_message(seed_text)
        
        generated_text = seed_text
        for _ in range(next_words):
            token_list = self.tokenizer.texts_to_sequences([generated_text])[0]
            token_list = token_list[-self.max_sequence_length+1:]
            token_list = pad_sequences([token_list], maxlen=self.max_sequence_length-1, padding='pre')
            
            predicted = self.model.predict(token_list, verbose=0)
            predicted_index = np.argmax(predicted, axis=-1)[0]
            
            output_word = self.tokenizer.index_word.get(predicted_index, "<UNKNOWN>")
            
            generated_text += " " + output_word
            
            if output_word in ['.', '?', '!']:
                break
        
        response = generated_text[len(seed_text):].strip()
        return response

learner = MessageLearner()

# Load the model if it exists
model_loaded = learner.load_model()

# Load initial dataset and update the model
if os.path.exists('dataset.txt'):
    with open('dataset.txt', 'r', encoding='utf-8') as f:
        initial_messages = f.readlines()
    for message in initial_messages:
        learner.add_message(message.strip())
    print(f"Loaded and processed {len(initial_messages)} messages from dataset.txt")
    
    # Train the model with the new data
    if learner.messages:
        learner.train()
else:
    print("No dataset.txt found. Starting with the existing model or an empty dataset.")

# If no data was loaded and no saved model exists, warn the user
if not learner.messages and not model_loaded:
    print("Warning: No initial data or saved model. The system needs some data to function properly.")

# Train the model with initial data if available
if learner.messages:
    learner.train()

# Load the model if it exists
learner.load_model()

@app.route('/learn', methods=['POST'])
def learn():
    message = request.json.get('message')
    if message:
        result = learner.add_message(message)
        return jsonify({"status": "success", "message": result}), 200
    else:
        return jsonify({"status": "error", "message": "No message provided"}), 400
    
@app.route('/generate', methods=['POST'])
def generate():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "No JSON data received"}), 400
        
        seed_text = data.get('seed_text')
        if not seed_text:
            return jsonify({"status": "error", "message": "No seed text provided"}), 400
        
        generated_text = learner.generate_text(seed_text)
        return jsonify({"status": "success", "generated_text": generated_text}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
if __name__ == '__main__':
    app.run(debug=False)