import os
import mysql.connector as mysql
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    return mysql.connect(
        host=os.getenv("DB_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )
    
def save_message(sender, text):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO messages (sender, text) VALUES (%s, %s)",
        (sender, text)
    )
    conn.commit()
    cursor.close()
    conn.close()