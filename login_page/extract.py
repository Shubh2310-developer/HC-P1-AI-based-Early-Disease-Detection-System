from flask import Flask, request, jsonify
import fitz  # PyMuPDF for digital PDFs
import pytesseract
import psycopg2
from pdf2image import convert_from_path
import os
import json
import re

app = Flask(__name__)

# PostgreSQL Connection Details
DB_HOST = "localhost"
DB_NAME = "Chatbot_UI"
DB_USER = "postgres"
DB_PASSWORD = "ChampioN@123"
DB_PORT = "5432"

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def is_pdf_scanned(pdf_path):
    """Detect if the PDF is scanned or digital"""
    try:
        doc = fitz.open(pdf_path)
        for page in doc:
            if page.get_text("text").strip():
                return False  # If any page has selectable text, it's digital
        return True  # Otherwise, it's scanned
    except Exception as e:
        print(f"Error checking PDF type: {str(e)}")
        return True  # Default to scanned if we can't determine

def extract_text_from_digital_pdf(pdf_path):
    """Extract text from a digital PDF"""
    try:
        text = ""
        doc = fitz.open(pdf_path)
        for page in doc:
            text += page.get_text("text") + "\n"
        return text.strip()
    except Exception as e:
        print(f"Error extracting text from digital PDF: {str(e)}")
        return ""

def extract_text_from_scanned_pdf(pdf_path):
    """Extract text from a scanned PDF using OCR"""
    try:
        images = convert_from_path(pdf_path)
        text = ""
        for img in images:
            text += pytesseract.image_to_string(img) + "\n"
        return text.strip()
    except Exception as e:
        print(f"Error extracting text from scanned PDF: {str(e)}")
        return ""

def extract_medical_values(text):
    """Extract medical values using regex patterns"""
    extracted_data = {}
    pattern = r"(?P<test>[A-Za-z\s\(\)]+)\s+(?P<value>[\d.,]+)\s*(?P<unit>[a-zA-Z/%μ]+)?"
    matches = re.findall(pattern, text)
    
    for test, value, unit in matches:
        test = test.strip()
        extracted_data[test] = f"{value} {unit}" if unit else value
    
    return extracted_data

def store_in_postgres(user_id, prompt, medical_data, raw_text):
    """Store extracted data in PostgreSQL"""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            port=DB_PORT
        )
        cursor = conn.cursor()
        
        query = """
        INSERT INTO medical_reports (user_id, prompt, medical_data, raw_text)
        VALUES (%s, %s, %s, %s)
        RETURNING object_id;
        """
        cursor.execute(query, (user_id, prompt, json.dumps(medical_data), raw_text))
        object_id = cursor.fetchone()[0]
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return object_id
    except Exception as e:
        print(f"❌ Error storing data: {str(e)}")
        return None

@app.route("/upload", methods=["POST"])
def upload_pdf():
    """API Endpoint to handle PDF upload"""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files["file"]
    prompt = request.form.get("prompt", "No Prompt Provided")
    user_id = request.form.get("user_id", None)
    
    if not file.filename.endswith(".pdf"):
        return jsonify({"error": "Only PDF files are allowed"}), 400
    
    file_path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(file_path)

    is_scanned = is_pdf_scanned(file_path)
    extracted_text = extract_text_from_scanned_pdf(file_path) if is_scanned else extract_text_from_digital_pdf(file_path)
    
    if not extracted_text:
        return jsonify({"error": "No text extracted from PDF"}), 500
    
    medical_data = extract_medical_values(extracted_text)
    object_id = store_in_postgres(user_id, prompt, medical_data, extracted_text)
    
    if not object_id:
        return jsonify({"error": "Failed to store data"}), 500
    
    return jsonify({"message": "File processed successfully", "object_id": object_id, "extracted_data": medical_data})

if __name__ == "__main__":
    app.run(debug=True)
