/**
 * Tests for frontend/src/lib/speechRecognition.ts
 *
 * This module wraps a native speech recognition module with error handling.
 * Tests verify:
 *  - Graceful fallback when the native module is unavailable
 *  - Correct delegation to the native module when available
 *  - Error handling and re-throwing behaviour
 *  - All four exported functions: requestSpeechRecognitionPermissionsAsync,
 *    startSpeechRecognition, stopSpeechRecognition, addSpeechListener
 *    and the availability check isNativeSpeechRecognitionAvailable
 */

// ---- Module-level mock for 'expo' requireOptionalNativeModule ----
// We need to control the return value of requireOptionalNativeModule per test,
// so we use a module-level variable that each test can mutate via the setter.

let mockNativeModule: Record<string, any> | null = null;

jest.mock('expo', () => ({
  requireOptionalNativeModule: jest.fn(() => mockNativeModule),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

// Import AFTER mocks are in place so the module-level variable is captured.
// Because the module caches `NativeSpeechModule` at load time, we must use
// jest.isolateModules() inside each test that changes mockNativeModule.

describe('speechRecognition – module unavailable (NativeSpeechModule === null)', () => {
  beforeEach(() => {
    mockNativeModule = null;
    jest.resetModules();
  });

  it('isNativeSpeechRecognitionAvailable returns false when module is null', () => {
    const { isNativeSpeechRecognitionAvailable } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    // Platform.OS is 'android', module is null → false
    expect(isNativeSpeechRecognitionAvailable()).toBe(false);
  });

  it('requestSpeechRecognitionPermissionsAsync returns unavailable response when module is null', async () => {
    const { requestSpeechRecognitionPermissionsAsync } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    const result = await requestSpeechRecognitionPermissionsAsync();
    expect(result.granted).toBe(false);
    expect(result.status).toBe('unavailable');
    expect(result.restricted).toBe(true);
  });

  it('startSpeechRecognition throws when module is null', () => {
    const { startSpeechRecognition } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    expect(() => startSpeechRecognition({})).toThrow(
      'Speech recognition module not available (requires dev build)'
    );
  });

  it('stopSpeechRecognition does not throw when module is null', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { stopSpeechRecognition } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    expect(() => stopSpeechRecognition()).not.toThrow();
    consoleSpy.mockRestore();
  });

  it('addSpeechListener returns null when module is null', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { addSpeechListener } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    const result = addSpeechListener('onResult', () => {});
    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });
});

describe('speechRecognition – module available but missing individual methods', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('requestSpeechRecognitionPermissionsAsync returns unavailable when requestPermissionsAsync is missing', async () => {
    mockNativeModule = {}; // present but no requestPermissionsAsync
    const { requestSpeechRecognitionPermissionsAsync } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    const result = await requestSpeechRecognitionPermissionsAsync();
    expect(result.granted).toBe(false);
    expect(result.status).toBe('unavailable');
    expect(result.restricted).toBe(true);
  });

  it('startSpeechRecognition throws when start method is missing', () => {
    mockNativeModule = {}; // present but no start()
    const { startSpeechRecognition } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    expect(() => startSpeechRecognition({})).toThrow(
      'Speech recognition start method not available'
    );
  });

  it('stopSpeechRecognition does not throw when stop method is missing', () => {
    mockNativeModule = {}; // present but no stop()
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { stopSpeechRecognition } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    expect(() => stopSpeechRecognition()).not.toThrow();
    consoleSpy.mockRestore();
  });

  it('addSpeechListener returns null when addListener is not a function', () => {
    mockNativeModule = { addListener: 'not-a-function' }; // wrong type
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { addSpeechListener } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    const result = addSpeechListener('onResult', () => {});
    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });
});

describe('speechRecognition – module available with all methods', () => {
  let mockStart: jest.Mock;
  let mockStop: jest.Mock;
  let mockRequestPermissions: jest.Mock;
  let mockAddListener: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    mockStart = jest.fn();
    mockStop = jest.fn();
    mockRequestPermissions = jest.fn().mockResolvedValue({ granted: true, status: 'granted' });
    mockAddListener = jest.fn().mockReturnValue({ remove: jest.fn() });

    mockNativeModule = {
      start: mockStart,
      stop: mockStop,
      requestPermissionsAsync: mockRequestPermissions,
      addListener: mockAddListener,
    };
  });

  it('isNativeSpeechRecognitionAvailable returns true on non-web platforms', () => {
    const { isNativeSpeechRecognitionAvailable } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    expect(isNativeSpeechRecognitionAvailable()).toBe(true);
  });

  it('requestSpeechRecognitionPermissionsAsync delegates to native module', async () => {
    const { requestSpeechRecognitionPermissionsAsync } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    const result = await requestSpeechRecognitionPermissionsAsync();
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(result.granted).toBe(true);
  });

  it('requestSpeechRecognitionPermissionsAsync returns error response when native call throws', async () => {
    mockRequestPermissions.mockRejectedValue(new Error('Permission denied by OS'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { requestSpeechRecognitionPermissionsAsync } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    const result = await requestSpeechRecognitionPermissionsAsync();
    expect(result.granted).toBe(false);
    expect(result.status).toBe('error');
    expect(result.restricted).toBe(true);
    consoleSpy.mockRestore();
  });

  it('startSpeechRecognition calls native start with provided options', () => {
    const { startSpeechRecognition } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    const options = { lang: 'en-US', continuous: true };
    startSpeechRecognition(options);
    expect(mockStart).toHaveBeenCalledWith(options);
  });

  it('startSpeechRecognition wraps native start error in descriptive message', () => {
    mockStart.mockImplementation(() => { throw new Error('hardware failure'); });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { startSpeechRecognition } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    expect(() => startSpeechRecognition({})).toThrow(
      'Speech recognition failed to start: hardware failure'
    );
    consoleSpy.mockRestore();
  });

  it('startSpeechRecognition wraps non-Error native failure', () => {
    mockStart.mockImplementation(() => { throw 'string-error'; }); // non-Error thrown
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { startSpeechRecognition } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    expect(() => startSpeechRecognition({})).toThrow(
      'Speech recognition failed to start: Unknown error'
    );
    consoleSpy.mockRestore();
  });

  it('stopSpeechRecognition delegates to native stop', () => {
    const { stopSpeechRecognition } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    stopSpeechRecognition();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('stopSpeechRecognition swallows error from native stop and logs it', () => {
    mockStop.mockImplementation(() => { throw new Error('stop failed'); });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { stopSpeechRecognition } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    expect(() => stopSpeechRecognition()).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[SpeechRecognition] Failed to stop recognition:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('addSpeechListener returns the subscription from native addListener', () => {
    const fakeSub = { remove: jest.fn() };
    mockAddListener.mockReturnValue(fakeSub);
    const { addSpeechListener } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    const listener = jest.fn();
    const result = addSpeechListener('onResult', listener);
    expect(mockAddListener).toHaveBeenCalledWith('onResult', listener);
    expect(result).toBe(fakeSub);
  });

  it('addSpeechListener returns null and logs error when native addListener throws', () => {
    mockAddListener.mockImplementation(() => { throw new Error('listener boom'); });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { addSpeechListener } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    const result = addSpeechListener('onResult', () => {});
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[SpeechRecognition] Failed to add onResult listener:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('addSpeechListener passes the correct event name through to native', () => {
    const { addSpeechListener } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    addSpeechListener('WakeWordDetected', () => {});
    expect(mockAddListener).toHaveBeenCalledWith('WakeWordDetected', expect.any(Function));
  });
});

describe('speechRecognition – web platform', () => {
  beforeEach(() => {
    jest.resetModules();
    // Swap Platform.OS to 'web'
    jest.mock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    mockNativeModule = { start: jest.fn(), stop: jest.fn() };
  });

  afterEach(() => {
    // Restore android mock
    jest.mock('react-native', () => ({
      Platform: { OS: 'android' },
    }));
  });

  it('isNativeSpeechRecognitionAvailable returns false on web even when module is present', () => {
    const { isNativeSpeechRecognitionAvailable } =
      require('../speechRecognition') as typeof import('../speechRecognition');
    expect(isNativeSpeechRecognitionAvailable()).toBe(false);
  });
});
