"""
Test script to verify resume privacy isolation between sessions.
This ensures User A's resume is NOT visible to User B.
"""

import asyncio
import websockets
import json
import base64

# Test resume content for two different users
USER_A_RESUME = """
John Doe
Senior Software Engineer
Email: john.doe@example.com

EXPERIENCE:
- 5 years at TechCorp building microservices with Python
- Led team of 10 developers
- Expertise in AWS and Kubernetes

SKILLS:
Python, Java, AWS, Docker, Kubernetes
"""

USER_B_RESUME = """
Jane Smith
Data Scientist
Email: jane.smith@example.com

EXPERIENCE:
- 3 years at DataCo doing machine learning
- Built recommendation systems
- Expertise in TensorFlow and PyTorch

SKILLS:
Python, R, TensorFlow, PyTorch, Pandas
"""

async def upload_resume_for_session(uri, resume_text, user_name):
    """Upload resume and get session ID"""
    async with websockets.connect(uri) as ws:
        # Wait for session_init
        msg = await ws.recv()
        data = json.loads(msg)
        session_id = data.get("session_id")
        print(f"[{user_name}] Connected with session_id: {session_id}")
        
        # Upload resume
        resume_b64 = base64.b64encode(resume_text.encode('utf-8')).decode('utf-8')
        await ws.send(json.dumps({
            "type": "resume",
            "name": f"{user_name}_resume.txt",
            "content": resume_b64
        }))
        
        # Wait for confirmation
        msg = await ws.recv()
        data = json.loads(msg)
        print(f"[{user_name}] Resume upload response: {data}")
        
        return session_id

async def ask_question(uri, question, user_name):
    """Ask a question and get response"""
    async with websockets.connect(uri) as ws:
        # Wait for session_init
        msg = await ws.recv()
        data = json.loads(msg)
        session_id = data.get("session_id")
        print(f"\n[{user_name}] Asking question with session_id: {session_id}")
        
        # Ask question
        await ws.send(json.dumps({
            "type": "coach",
            "question": question,
            "strict": False
        }))
        
        # Collect response
        response_text = ""
        while True:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=10.0)
                data = json.loads(msg)
                
                if data.get("type") == "coach":
                    text = data.get("text", "")
                    response_text += text
                    
                    # Check if response is complete
                    if data.get("reset"):
                        response_text = text
                    
                    # Simple end detection
                    if len(response_text) > 100:
                        break
            except asyncio.TimeoutError:
                break
        
        return response_text

async def test_privacy_isolation():
    """Main test function"""
    uri = "ws://localhost:8765"
    
    print("=" * 80)
    print("RESUME PRIVACY ISOLATION TEST")
    print("=" * 80)
    
    # Step 1: User A uploads their resume
    print("\n📤 Step 1: User A uploads their resume...")
    await upload_resume_for_session(uri, USER_A_RESUME, "User A")
    await asyncio.sleep(1)
    
    # Step 2: User B uploads their resume
    print("\n📤 Step 2: User B uploads their resume...")
    await upload_resume_for_session(uri, USER_B_RESUME, "User B")
    await asyncio.sleep(1)
    
    # Step 3: User A asks about Python experience (should reference THEIR resume)
    print("\n❓ Step 3: User A asks about Python experience...")
    response_a = await ask_question(uri, "What Python experience do I have?", "User A")
    print(f"\n[User A Response]:\n{response_a[:500]}...")
    
    # Check if User A's response mentions THEIR companies
    if "TechCorp" in response_a or "microservices" in response_a:
        print("✅ PASS: User A's response includes their resume details")
    else:
        print("❌ FAIL: User A's response doesn't include their resume details")
    
    if "DataCo" in response_a or "machine learning" in response_a or "recommendation" in response_a:
        print("❌ FAIL: User A's response includes User B's resume details (PRIVACY BREACH!)")
    else:
        print("✅ PASS: User A's response does NOT include User B's resume details")
    
    await asyncio.sleep(1)
    
    # Step 4: User B asks about Python experience (should reference THEIR resume)
    print("\n❓ Step 4: User B asks about Python experience...")
    response_b = await ask_question(uri, "What Python experience do I have?", "User B")
    print(f"\n[User B Response]:\n{response_b[:500]}...")
    
    # Check if User B's response mentions THEIR companies
    if "DataCo" in response_b or "machine learning" in response_b or "TensorFlow" in response_b:
        print("✅ PASS: User B's response includes their resume details")
    else:
        print("❌ FAIL: User B's response doesn't include their resume details")
    
    if "TechCorp" in response_b or "microservices" in response_b or "Kubernetes" in response_b:
        print("❌ FAIL: User B's response includes User A's resume details (PRIVACY BREACH!)")
    else:
        print("✅ PASS: User B's response does NOT include User A's resume details")
    
    print("\n" + "=" * 80)
    print("TEST COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    print("\n⚠️  Make sure the server is running on ws://localhost:8765")
    print("Run: python python/server.py\n")
    
    try:
        asyncio.run(test_privacy_isolation())
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
