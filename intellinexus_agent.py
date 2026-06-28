#!/usr/bin/env python3
"""
IntelliNexus Autonomous Data Readiness Agent
Architecture: Brain + Memory + Tools + Loop
No mock fallbacks. Fully functional.
"""

import os
import csv
import json
import math
from collections import Counter

# ─── 1. ENV LOADER ────────────────────────────────────────────────────────────
def load_env():
    """Custom parser to load variables from .env if present."""
    if os.path.exists(".env"):
        with open(".env", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip().strip("'\"")

# ─── 2. MEMORY MANAGEMENT ──────────────────────────────────────────────────────
MEMORY_FILE = "memory.json"

def load_memory():
    if os.path.exists(MEMORY_FILE):
        try:
            with open(MEMORY_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_memory(memory):
    with open(MEMORY_FILE, "w") as f:
        json.dump(memory, f, indent=2)

def save_fact(key: str, value: str) -> str:
    """Tool: Saves a long-term fact to the JSON memory store."""
    mem = load_memory()
    mem[key] = value
    save_memory(mem)
    return f"Fact successfully recorded in long-term memory: '{key}' -> '{value}'"

# ─── 3. MACHINE LEARNING: KNN COLUMN MAPPER ────────────────────────────────────
class CharKNNClassifier:
    """A real KNN classifier utilizing character-level 2-grams cosine similarity.
    Calculates distances in vector space to map columns without mock logic.
    """
    def __init__(self, k=3):
        self.k = k
        self.dataset = []

    def _get_ngrams(self, text):
        text = f"^{text.lower().strip()}$"
        return [text[i:i+2] for i in range(len(text)-1)]

    def _to_vector(self, text):
        return Counter(self._get_ngrams(text))

    def _cosine_similarity(self, vec1, vec2):
        intersection = set(vec1.keys()) & set(vec2.keys())
        numerator = sum([vec1[x] * vec2[x] for x in intersection])
        sum1 = sum([val**2 for val in vec1.values()])
        sum2 = sum([val**2 for val in vec2.values()])
        denominator = math.sqrt(sum1) * math.sqrt(sum2)
        if not denominator:
            return 0.0
        return numerator / denominator

    def fit(self, X, y):
        self.dataset = [(self._to_vector(x), label) for x, label in zip(X, y)]

    def predict(self, query):
        q_vec = self._to_vector(query)
        distances = []
        for d_vec, label in self.dataset:
            sim = self._cosine_similarity(q_vec, d_vec)
            distances.append((1.0 - sim, label))
        
        distances.sort(key=lambda x: x[0])
        neighbors = distances[:self.k]
        votes = Counter([label for dist, label in neighbors])
        return votes.most_common(1)[0][0]

# Training set for canonical fields
TRAINING_X = [
    "cust nm", "customer_name", "client", "buyer_name", "purchased_by", "client_name", "customer",
    "inv date", "invoice_date", "date_issued", "billing_date", "creation_dt", "date",
    "total amt", "total_amount", "sum_total", "grand_total", "amount_due", "to_pay",
    "tax_id", "tax_number", "vat_no", "vat_id", "registration_no", "tax_code",
    "vendor nm", "vendor_name", "seller", "supplier", "biller", "merchant", "provider"
]
TRAINING_Y = [
    "customer_name", "customer_name", "customer_name", "customer_name", "customer_name", "customer_name", "customer_name",
    "invoice_date", "invoice_date", "invoice_date", "invoice_date", "invoice_date", "invoice_date",
    "total_amount", "total_amount", "total_amount", "total_amount", "total_amount", "total_amount",
    "tax_id", "tax_id", "tax_id", "tax_id", "tax_id", "tax_id",
    "vendor_name", "vendor_name", "vendor_name", "vendor_name", "vendor_name", "vendor_name", "vendor_name"
]

knn = CharKNNClassifier(k=3)
knn.fit(TRAINING_X, TRAINING_Y)

def map_column(messy_name: str) -> str:
    """Tool: Maps a messy column name to the canonical database schema using the KNN classifier."""
    return knn.predict(messy_name)

# ─── 4. CSV VALIDATION TOOL ────────────────────────────────────────────────────
def validate_csv(csv_path: str) -> dict:
    """Tool: Validates if a CSV file meets AI-ready standards (missing rates, row/column validation)."""
    if not os.path.exists(csv_path):
        return {"error": f"Target file '{csv_path}' does not exist."}
    
    try:
        with open(csv_path, mode="r", encoding="utf-8") as f:
            reader = csv.reader(f)
            headers = next(reader, None)
            if not headers:
                return {"error": "CSV file is empty or has no header row."}
            
            rows = list(reader)
            row_count = len(rows)
            col_count = len(headers)
            
            null_counts = {h: 0 for h in headers}
            for row in rows:
                for idx, val in enumerate(row):
                    if idx < len(headers):
                        if not val.strip() or val.lower() in ["null", "none", "n/a", ""]:
                            null_counts[headers[idx]] += 1
            
            null_pct = {h: (count / row_count) if row_count > 0 else 0 for h, count in null_counts.items()}
            is_ai_ready = row_count > 0 and all(pct < 0.2 for pct in null_pct.values())
            
            return {
                "success": True,
                "headers": headers,
                "row_count": row_count,
                "col_count": col_count,
                "null_percentages": null_pct,
                "is_ai_ready": is_ai_ready
            }
    except Exception as e:
        return {"error": f"CSV validation failed: {str(e)}"}

# ─── 5. HUMAN-IN-THE-LOOP ESCALATION ──────────────────────────────────────────
def ask_human(question: str) -> str:
    """Tool: Prompts a human review query via standard input."""
    print(f"\n⚠️  [HUMAN-IN-THE-LOOP INTERACTION REQUESTED]")
    print(f"Question: {question}")
    answer = input("Provide your response/decision: ")
    return f"Human Answer: {answer}"

# ─── 6. THE AGENTIC EXECUTION LOOP ─────────────────────────────────────────────
def run_agentic_loop(goal: str):
    load_env()
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://api.groq.com/openai/v1")
    model = os.environ.get("AI_TEXT_MODEL", "llama-3.3-70b-versatile")
    
    if not api_key:
        raise ValueError("AI_INTEGRATIONS_OPENAI_API_KEY is not defined in environment/.env file. Brain cannot function without reasoning client.")

    # Import openai dynamically
    try:
        from openai import OpenAI
    except ImportError:
        raise ImportError("Please install the 'openai' library using: pip install openai")
        
    client = OpenAI(api_key=api_key, base_url=base_url)
    memory = load_memory()
    
    system_prompt = f"""You are IntelliNexus Agent, an autonomous data engineering agent.
Your objective is to execute data readiness tasks, map dirty column names to canonical forms, validate CSV files, and persist rules to memory.

Your long-term memory facts:
{json.dumps(memory, indent=2)}

You have access to the following tools:
1. map_column(messy_name: str)
   - Description: Uses character-level KNN similarity to map a dirty column name to a canonical database field.
2. validate_csv(csv_path: str)
   - Description: Inspects a CSV file for rows, columns, null percentages, and quality thresholds.
3. save_fact(key: str, value: str)
   - Description: Saves a new key-value fact into your long-term memory JSON store.
4. ask_human(question: str)
   - Description: Escalates to a human engineer when you encounter severe errors, format ambiguities, or need user approval.

You MUST execute step-by-step. In each turn, call the necessary tools. Do not simulate tool results.
Once the goal is fully achieved, summarize your actions and complete the task.
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Goal: {goal}"}
    ]
    
    tools = [
        {
            "type": "function",
            "function": {
                "name": "map_column",
                "description": "Map a dirty column name to the canonical IntelliNexus database schema using KNN classification.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "messy_name": {"type": "string", "description": "The header/column name to map."}
                    },
                    "required": ["messy_name"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "validate_csv",
                "description": "Inspect and validate a local CSV file for AI readiness.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "csv_path": {"type": "string", "description": "The relative or absolute file path to the CSV."}
                    },
                    "required": ["csv_path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "save_fact",
                "description": "Store a newly discovered data rule or mapping fact in long-term memory for future runs.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string", "description": "The identifier or concept name."},
                        "value": {"type": "string", "description": "The rule details or mapping target."}
                    },
                    "required": ["key", "value"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "ask_human",
                "description": "Prompt the user or human-in-the-loop directly to resolve ambiguity or seek approval.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string", "description": "The question to present to the user."}
                    },
                    "required": ["question"]
                }
            }
        }
    ]
    
    print(f"\n==========================================")
    print(f"🤖 [Agent Loop Started]")
    print(f"Goal: {goal}")
    print(f"==========================================\n")
    
    steps = 0
    max_steps = 6
    done = False
    
    while not done and steps < max_steps:
        steps += 1
        print(f"\n--- [TURN {steps} / {max_steps}] ---")
        
        # Brain THINK
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=0.1
        )
        
        msg = response.choices[0].message
        messages.append(msg)
        
        if msg.content:
            print(f"💭 THINKING:\n{msg.content}")
            
        if msg.tool_calls:
            for call in msg.tool_calls:
                tool_name = call.function.name
                args = json.loads(call.function.arguments)
                print(f"🎬 ACTING: Tool '{tool_name}' with arguments {json.dumps(args)}")
                
                # Execute tool
                try:
                    if tool_name == "map_column":
                        result = map_column(args["messy_name"])
                        print(f"  👁️  OBSERVATION (KNN Mapper): mapped '{args['messy_name']}' -> '{result}'")
                    elif tool_name == "validate_csv":
                        res_dict = validate_csv(args["csv_path"])
                        result = json.dumps(res_dict)
                        print(f"  👁️  OBSERVATION (CSV Validator): rows={res_dict.get('row_count')}, columns={res_dict.get('col_count')}, ready={res_dict.get('is_ai_ready')}")
                    elif tool_name == "save_fact":
                        result = save_fact(args["key"], args["value"])
                        print(f"  👁️  OBSERVATION (Memory): {result}")
                    elif tool_name == "ask_human":
                        result = ask_human(args["question"])
                        print(f"  👁️  OBSERVATION (Human input): {result}")
                    else:
                        result = f"Error: Tool '{tool_name}' is not recognized."
                        print(f"  👁️  OBSERVATION (Error): {result}")
                except Exception as ex:
                    result = f"Error occurred executing tool '{tool_name}': {str(ex)}"
                    print(f"  👁️  OBSERVATION (Execution Error): {result}")
                
                messages.append({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "name": tool_name,
                    "content": str(result)
                })
        else:
            print(f"\n✅ Goal complete. Final Answer reached.")
            done = True

    if not done:
        print(f"\n⚠️ Warning: Agent reached maximum steps ({max_steps}) without finishing.")

if __name__ == "__main__":
    import sys
    # Example execution goal
    default_goal = "Determine the canonical mapping for column 'cust nm', validate the CSV file 'mock_invoice.csv', and save a long-term rule mapping that 'cust nm' corresponds to 'customer_name'."
    goal = sys.argv[1] if len(sys.argv) > 1 else default_goal
    
    # Create a mock invoice CSV to validate if it doesn't exist
    if not os.path.exists("mock_invoice.csv"):
        with open("mock_invoice.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["cust nm", "inv date", "total amt"])
            writer.writerow(["Acme Corp", "2026-06-28", "2500.00"])
            writer.writerow(["Globex Corp", "2026-06-29", "1250.50"])
            writer.writerow(["", "2026-06-27", "95.00"]) # Row with null/empty field
            
    try:
        run_agentic_loop(goal)
    except Exception as e:
        print(f"\n❌ Execution Failed: {str(e)}", file=sys.stderr)
        sys.exit(1)
