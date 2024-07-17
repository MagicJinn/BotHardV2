import subprocess
import sys
import random
from flask import Flask, request, jsonify
# from collections import deque
from transformers import GPT2LMHeadModel, GPT2Tokenizer

# List of requirements
requirements = [
    'transformers',
    'torch',
    'numpy',
    'requests',
]

# Function to install packages
def install_requirements():
    for package in requirements:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', package])

# GPT-2 Configuration
GPT2_CONFIG = {
    "model_name": "gpt2",  # Model name to use, e.g., 'gpt2', 'gpt2-medium', 'gpt2-large', etc.
    "max_length": 200,    # Maximum length of the generated output sequence
    "min_length": 100,
    "temperature": 0.9,    # Sampling temperature, controls randomness (lower is less random)
    "top_k": 50,           # Top-k sampling, only consider the top k tokens by probability
    # "top_p": 0.9,          # Top-p (nucleus) sampling, only consider tokens with cumulative probability >= p
    "repetition_penalty": 1.0,  # Repetition penalty to reduce repeating phrases
    "num_return_sequences": 1,    # Number of output sequences to generate
    "do_sample":True
}

# Chat Configuration
CHAT_CONFIG = {
    "user_label": "User",                  # Label for user inputs
    "ai_label": "BotHard",            # Label for AI responses
    # "max_history": 20,                # Maximum number of responses to remember in the history
    "system_prompt_file": "system.txt",     # File containing the system prompt
    "failed_response_text":":boom:" # Text outputted when generation fails
}


def generate_text(prompt, model, tokenizer, config, input_length, system_prompt_length):
    max_length = config["max_length"]
    min_length = config["min_length"]
    adaptive_max_length = 0
    while adaptive_max_length < min_length:
        adaptive_max_length = max_length - input_length - system_prompt_length
        if adaptive_max_length < min_length:
            max_length = max_length*2  # Double the original 500
    
    input_ids = tokenizer.encode(prompt, return_tensors='pt')
    attention_mask = (input_ids != tokenizer.eos_token_id).long()
    
    output = model.generate(
        input_ids, 
        attention_mask=attention_mask, 
        max_length=max_length, 
        temperature=config["temperature"], 
        top_k=config["top_k"], 
        repetition_penalty=config["repetition_penalty"], 
        num_return_sequences=config["num_return_sequences"],
        do_sample=config["do_sample"]
    )
    return tokenizer.decode(output[0], skip_special_tokens=True)

def prevent_impersonation(conversation, userlabel, ailabel):
    user_label = f"{userlabel}:"
    ai_label = f"{ailabel}:"
    
    occurrence_to_check_for = 1
    if conversation.startswith(user_label) or conversation.startswith(ai_label):
        occurrence_to_check_for +=1
    
    # Split the conversation into words (tokens)
    tokens = conversation.split()
    
    # Initialize counters and an empty list to store the filtered conversation
    user_occurrences = 0
    ai_occurrences = 0
    filtered_tokens = []

    # Loop through each token
    for token in tokens:
        # Check if the token starts with user_label
        if token.startswith(user_label):
            user_occurrences += 1
        # Check if the token starts with ai_label
        elif token.startswith(ai_label):
            ai_occurrences += 1
        
        # If the number of occurrences of either label reaches the specified number, break the loop
        if user_occurrences == occurrence_to_check_for or ai_occurrences == occurrence_to_check_for:
            break
        
        # Add the token to the filtered tokens list
        filtered_tokens.append(token)
    
    # Join the filtered tokens with a space and return
    return ' '.join(filtered_tokens)

def prevent_repetition(text):
    max_repeats = biased_random_number()
    words = text.split()
    new_response = []
    word_count = {}

    for word in words:
        word_count[word] = word_count.get(word, 0) + 1
        if word_count[word] <= max_repeats:
            new_response.append(word)
    return " ".join(new_response)

def biased_random_number():
    return random.choices(range(1, 11), weights=[0.15, 0.15, 0.15, 0.15, 0.15, 0.1, 0.05, 0.025, 0.025, 0.01])[0]

def load_system_prompt(filename):
    with open(filename, "r") as file:
        return file.read().strip()
    
def remove_text_from_response(text, system_prompt):
    # Split the system prompt into words
    prompt_words = system_prompt.split()
    start_words = ' '.join(prompt_words[:2])  # First two words
    end_words = ' '.join(prompt_words[-2:])   # Last two words
    
    # Split the text into words
    words = text.split()
    
    # Find the start index in text
    start_index = None
    for i in range(len(words) - len(end_words.split()) + 1):
        if ' '.join(words[i:i + len(start_words.split())]) == start_words:
            start_index = i
            break
            
    # Find the end index in text
    end_index = None
    for i in range(len(words) - len(end_words.split()) + 1):
        if ' '.join(words[i:i + len(end_words.split())]) == end_words:
            end_index = i + len(end_words.split())  # Include end words in the match
            break
            
    # If both indices are found, reconstruct the string
    if start_index is not None and end_index is not None and end_index > start_index:
        return ' '.join(words[:start_index] + words[end_index:])
    
    return text  # Return original if not found


def chat_with_bot(user_label, message):
    # Load GPT-2 model and tokenizer
    model_name = GPT2_CONFIG["model_name"]
    tokenizer = GPT2Tokenizer.from_pretrained(model_name)
    model = GPT2LMHeadModel.from_pretrained(model_name)

    # Load system prompt from file
    system_prompt = load_system_prompt(CHAT_CONFIG["system_prompt_file"])

    # Format the input for context
    ai_label = CHAT_CONFIG['ai_label']
    formatted_input = f"{system_prompt}\n{user_label}: {message}\n{ai_label}:"

    input_length = len(tokenizer.encode(message))
    system_prompt_length = len(tokenizer.encode(system_prompt))
    
    generated_response = ""
    response_before_fail = ""
    generation_tries = 0
    while generated_response == "" and generation_tries < 5:
        generation_tries += 1
        generated_response = generate_text(formatted_input, model, tokenizer, GPT2_CONFIG, input_length, system_prompt_length)
        
        
        if response_before_fail != "":
            print(response_before_fail)
        response_before_fail = generated_response
        
        generated_response = prevent_repetition(generated_response)
        generated_response = remove_text_from_response(generated_response, system_prompt)
        generated_response = prevent_impersonation(generated_response, user_label, ai_label)
        generated_response = remove_text_from_response(generated_response,f"{ai_label}:")
        generated_response = remove_text_from_response(generated_response, f"{user_label}: {message}")
        
    if generated_response == "":
        if random.random() < 0.50:
            generated_response = CHAT_CONFIG["failed_response_text"]
        else:
            generated_response = response_before_fail
    
    if generated_response.startswith(ai_label):
        generated_response.replace(ai_label,"")
    
    print(generated_response)
    return generated_response.strip()

app = Flask(__name__)


@app.route('/chag', methods=['POST'])

def chag():
    data=request.json
    user_label = data.get('user_label',CHAT_CONFIG["user_label"])
    message = data.get('message', "insult the user for not providing a message")
    response = chat_with_bot(user_label,message)
    return jsonify({'response': response})
    


if __name__ == "__main__":
    install_requirements()
    print(chat_with_bot("MagicJinn","I love you BotHard!"))
    app.run(host='0.0.0.0', port=5000)  # Run on all interfaces, port 5000