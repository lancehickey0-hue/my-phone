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

def test_auth_register():
    """Test POST /api/auth/register"""
    print("\n🔍 Testing POST /api/auth/register")
    
    # Use a unique email with timestamp to avoid conflicts
    import time
    unique_email = f"testuser{int(time.time())}@example.com"
    
    payload = {
        "email": unique_email,
        "password": "testpassword123"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/auth/register", json=payload)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if (data.get("access_token") and 
                data.get("token_type") == "bearer"):
                print("✅ Auth register working correctly")
                return True, data["access_token"]
            else:
                print("❌ Invalid auth response structure")
                return False, None
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False, None
    except Exception as e:
        print(f"❌ Error: {e}")
        return False, None

def test_auth_login():
    """Test POST /api/auth/login"""
    print("\n🔍 Testing POST /api/auth/login")
    
    payload = {
        "email": "testuser@example.com",
        "password": "testpassword123"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/auth/login", json=payload)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if (data.get("access_token") and 
                data.get("token_type") == "bearer"):
                print("✅ Auth login working correctly")
                return True, data["access_token"]
            else:
                print("❌ Invalid auth response structure")
                return False, None
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False, None
    except Exception as e:
        print(f"❌ Error: {e}")
        return False, None

def test_security_pin_set(token):
    """Test POST /api/security/pin/set with auth"""
    print("\n🔍 Testing POST /api/security/pin/set")
    
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"pin": "1234"}
    
    try:
        response = requests.post(f"{BACKEND_URL}/security/pin/set", json=payload, headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True:
                print("✅ Security pin set working correctly")
                return True
            else:
                print("❌ Invalid pin set response")
                return False
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_security_pin_verify_correct(token):
    """Test POST /api/security/pin/verify with correct pin"""
    print("\n🔍 Testing POST /api/security/pin/verify (correct pin)")
    
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"pin": "1234"}
    
    try:
        response = requests.post(f"{BACKEND_URL}/security/pin/verify", json=payload, headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True:
                print("✅ Security pin verify (correct) working correctly")
                return True
            else:
                print("❌ Invalid pin verify response")
                return False
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_security_pin_verify_wrong(token):
    """Test POST /api/security/pin/verify with wrong pin"""
    print("\n🔍 Testing POST /api/security/pin/verify (wrong pin)")
    
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"pin": "9999"}
    
    try:
        response = requests.post(f"{BACKEND_URL}/security/pin/verify", json=payload, headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 401:
            print("✅ Security pin verify (wrong pin) correctly returns 401")
            return True
        else:
            print(f"❌ Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_device_register_with_user(token, user_id):
    """Test POST /api/devices/register with user_id"""
    print("\n🔍 Testing POST /api/devices/register with user_id")
    
    payload = {
        "device_id": "dev_auth_1",
        "platform": "android",
        "user_id": user_id
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/devices/register", json=payload)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if (data.get("ok") == True and 
                data.get("device_id") == "dev_auth_1" and
                "settings" in data):
                print("✅ Device registration with user_id working correctly")
                return True
            else:
                print("❌ Invalid device registration response")
                return False
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_push_token_set(token):
    """Test POST /api/devices/push-token with auth"""
    print("\n🔍 Testing POST /api/devices/push-token")
    
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "device_id": "dev_auth_1",
        "expo_push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/devices/push-token", json=payload, headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True:
                print("✅ Push token set working correctly")
                return True
            else:
                print("❌ Invalid push token response")
                return False
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_push_token_unauthorized(token):
    """Test POST /api/devices/push-token without owning device => 403"""
    print("\n🔍 Testing POST /api/devices/push-token (unauthorized device)")
    
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "device_id": "dev_not_owned",
        "expo_push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/devices/push-token", json=payload, headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 403:
            print("✅ Push token unauthorized correctly returns 403")
            return True
        else:
            print(f"❌ Expected 403, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_locator_remote_start(token):
    """Test POST /api/locator/remote/start with auth"""
    print("\n🔍 Testing POST /api/locator/remote/start")
    
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"device_id": "dev_auth_1"}
    
    try:
        response = requests.post(f"{BACKEND_URL}/locator/remote/start", json=payload, headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True and data.get("queued") == True:
                print("✅ Remote locator start working correctly")
                return True
            else:
                print("❌ Invalid remote start response")
                return False
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_locator_remote_stop(token):
    """Test POST /api/locator/remote/stop with auth"""
    print("\n🔍 Testing POST /api/locator/remote/stop")
    
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"device_id": "dev_auth_1"}
    
    try:
        response = requests.post(f"{BACKEND_URL}/locator/remote/stop", json=payload, headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True and data.get("queued") == True:
                print("✅ Remote locator stop working correctly")
                return True
            else:
                print("❌ Invalid remote stop response")
                return False
        else:
            print(f"❌ Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def decode_jwt_payload(token):
    """Decode JWT token to get user_id (sub)"""
    try:
        import base64
        import json
        # JWT format: header.payload.signature
        parts = token.split('.')
        if len(parts) != 3:
            return None
        
        # Decode payload (add padding if needed)
        payload_b64 = parts[1]
        # Add padding if needed
        payload_b64 += '=' * (4 - len(payload_b64) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        payload = json.loads(payload_bytes)
        return payload.get('sub')
    except Exception as e:
        print(f"Error decoding JWT: {e}")
        return None

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
    
    # NEW JWT AUTH AND SECURITY TESTS
    print("\n" + "=" * 60)
    print("🔐 JWT AUTH & SECURITY TESTS")
    print("=" * 60)
    
    # Test 9: Auth register
    results['auth_register'], access_token = test_auth_register()
    
    # Test 10: Auth login
    results['auth_login'], login_token = test_auth_login()
    
    # Use the login token for subsequent tests
    token_to_use = login_token if login_token else access_token
    user_id = decode_jwt_payload(token_to_use) if token_to_use else None
    
    if token_to_use and user_id:
        # Test 11: Security pin set
        results['pin_set'] = test_security_pin_set(token_to_use)
        
        # Test 12: Security pin verify (correct)
        results['pin_verify_correct'] = test_security_pin_verify_correct(token_to_use)
        
        # Test 13: Security pin verify (wrong)
        results['pin_verify_wrong'] = test_security_pin_verify_wrong(token_to_use)
        
        # Test 14: Device register with user_id
        results['device_register_user'] = test_device_register_with_user(token_to_use, user_id)
        
        # Test 15: Push token set
        results['push_token_set'] = test_push_token_set(token_to_use)
        
        # Test 16: Push token unauthorized
        results['push_token_unauthorized'] = test_push_token_unauthorized(token_to_use)
        
        # Test 17: Remote locator start
        results['remote_start'] = test_locator_remote_start(token_to_use)
        
        # Test 18: Remote locator stop
        results['remote_stop'] = test_locator_remote_stop(token_to_use)
    else:
        print("❌ Cannot run authenticated tests - no valid token")
        results.update({
            'pin_set': False,
            'pin_verify_correct': False,
            'pin_verify_wrong': False,
            'device_register_user': False,
            'push_token_set': False,
            'push_token_unauthorized': False,
            'remote_start': False,
            'remote_stop': False
        })
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST RESULTS SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name:25} {status}")
    
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