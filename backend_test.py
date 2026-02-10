#!/usr/bin/env python3
"""
Backend API Testing for My Phone App
Tests all FastAPI endpoints via the ingress URL
"""

import requests
import json
import sys
from datetime import datetime

# Get backend URL from frontend .env
BACKEND_URL = "https://virtual-companion-218.preview.emergentagent.com/api"

def test_api_root():
    """Test GET /api/ endpoint"""
    print("🔍 Testing GET /api/")
    try:
        response = requests.get(f"{BACKEND_URL}/")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("message") == "My Phone API":
                print("✅ Root endpoint working correctly")
                return True
            else:
                print("❌ Unexpected message in response")
                return False
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_device_register():
    """Test POST /api/devices/register"""
    print("\n🔍 Testing POST /api/devices/register")
    
    # Test successful registration
    payload = {
        "device_id": "dev_test_1",
        "platform": "ios"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/devices/register", json=payload)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if (data.get("ok") == True and 
                data.get("device_id") == "dev_test_1" and
                "settings" in data):
                settings = data["settings"]
                if (settings.get("device_id") == "dev_test_1" and
                    settings.get("enabled") == True and
                    "wake_phrase" in settings and
                    "stop_phrase" in settings):
                    print("✅ Device registration working correctly")
                    return True, data
                else:
                    print("❌ Invalid settings structure in response")
                    return False, None
            else:
                print("❌ Invalid response structure")
                return False, None
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False, None
    except Exception as e:
        print(f"❌ Error: {e}")
        return False, None

def test_device_register_error():
    """Test POST /api/devices/register with missing device_id"""
    print("\n🔍 Testing POST /api/devices/register (error case)")
    
    payload = {
        "device_id": "",  # Empty device_id should cause error
        "platform": "ios"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/devices/register", json=payload)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 400:
            print("✅ Error handling working correctly for empty device_id")
            return True
        else:
            print(f"❌ Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_get_locator_settings():
    """Test GET /api/locator/settings/{device_id}"""
    print("\n🔍 Testing GET /api/locator/settings/dev_test_1")
    
    try:
        response = requests.get(f"{BACKEND_URL}/locator/settings/dev_test_1")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if (data.get("device_id") == "dev_test_1" and
                "enabled" in data and
                "wake_phrase" in data and
                "stop_phrase" in data):
                print("✅ Get locator settings working correctly")
                return True, data
            else:
                print("❌ Invalid settings structure")
                return False, None
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False, None
    except Exception as e:
        print(f"❌ Error: {e}")
        return False, None

def test_update_locator_settings():
    """Test PUT /api/locator/settings/{device_id}"""
    print("\n🔍 Testing PUT /api/locator/settings/dev_test_1")
    
    payload = {
        "wake_phrase": "Hey My Phone Where Are You",
        "stop_phrase": "Found You Thanks"
    }
    
    try:
        response = requests.put(f"{BACKEND_URL}/locator/settings/dev_test_1", json=payload)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            # Check if phrases are normalized to lowercase
            expected_wake = "hey my phone where are you"
            expected_stop = "found you thanks"
            
            if (data.get("device_id") == "dev_test_1" and
                data.get("wake_phrase") == expected_wake and
                data.get("stop_phrase") == expected_stop):
                print("✅ Update locator settings working correctly (normalized)")
                return True, data
            else:
                print(f"❌ Phrases not normalized correctly. Got wake: '{data.get('wake_phrase')}', stop: '{data.get('stop_phrase')}'")
                return False, None
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False, None
    except Exception as e:
        print(f"❌ Error: {e}")
        return False, None

def test_chat():
    """Test POST /api/chat"""
    print("\n🔍 Testing POST /api/chat")
    
    payload = {
        "device_id": "dev_test_1",
        "message": "Hello"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/chat", json=payload)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            reply = data.get("reply", "")
            if reply and reply.strip():
                print(f"✅ Chat working correctly - got non-empty reply: '{reply[:50]}...'")
                return True, data
            else:
                print("❌ Empty or missing reply from LLM")
                return False, None
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False, None
    except Exception as e:
        print(f"❌ Error: {e}")
        return False, None

def test_chat_error():
    """Test POST /api/chat with missing device_id"""
    print("\n🔍 Testing POST /api/chat (error case)")
    
    payload = {
        "device_id": "",  # Empty device_id should cause error
        "message": "Hello"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/chat", json=payload)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 400:
            print("✅ Error handling working correctly for empty device_id in chat")
            return True
        else:
            print(f"❌ Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_chat_history():
    """Test GET /api/chat/history/{device_id}"""
    print("\n🔍 Testing GET /api/chat/history/dev_test_1")
    
    try:
        response = requests.get(f"{BACKEND_URL}/chat/history/dev_test_1")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if (data.get("device_id") == "dev_test_1" and
                "messages" in data and
                isinstance(data["messages"], list)):
                messages = data["messages"]
                # Should have at least user + assistant messages from previous chat test
                if len(messages) >= 2:
                    user_msg = next((m for m in messages if m["role"] == "user"), None)
                    assistant_msg = next((m for m in messages if m["role"] == "assistant"), None)
                    if user_msg and assistant_msg:
                        print(f"✅ Chat history working correctly - found {len(messages)} messages")
                        return True, data
                    else:
                        print("❌ Missing user or assistant messages in history")
                        return False, None
                else:
                    print(f"✅ Chat history endpoint working (found {len(messages)} messages)")
                    return True, data
            else:
                print("❌ Invalid chat history structure")
                return False, None
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False, None
    except Exception as e:
        print(f"❌ Error: {e}")
        return False, None

def main():
    """Run all backend tests"""
    print("🚀 Starting Backend API Tests")
    print(f"Backend URL: {BACKEND_URL}")
    print("=" * 60)
    
    results = {}
    
    # Test 1: Root endpoint
    results['root'] = test_api_root()
    
    # Test 2: Device registration
    results['register'], register_data = test_device_register()
    
    # Test 3: Device registration error case
    results['register_error'] = test_device_register_error()
    
    # Test 4: Get locator settings
    results['get_settings'], settings_data = test_get_locator_settings()
    
    # Test 5: Update locator settings
    results['update_settings'], updated_settings = test_update_locator_settings()
    
    # Test 6: Chat
    results['chat'], chat_data = test_chat()
    
    # Test 7: Chat error case
    results['chat_error'] = test_chat_error()
    
    # Test 8: Chat history
    results['chat_history'], history_data = test_chat_history()
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST RESULTS SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name:20} {status}")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All backend tests PASSED!")
        return True
    else:
        print("⚠️  Some backend tests FAILED!")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)