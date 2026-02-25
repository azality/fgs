/**
 * Test Suite Loader
 *
 * This utility loads the P0 test suite into the browser console
 * for easy manual testing during development.
 *
 * IMPORTANT:
 * - This file MUST NOT pull in src/tests/** during production builds.
 * - Everything is hard-gated behind import.meta.env.DEV so Vite/Rollup can tree-shake it out.
 *
 * Usage in browser console (DEV only):
 * - await loadTestSuite()
 * - await setupTestEnvironment()
 * - await auditTestEnvironment()
 * - await simulateDevices()
 */

export async function loadTestSuite() {
  // ✅ Hard gate: production builds must never import anything from src/tests/**
  if (!import.meta.env.DEV) {
    // Don't throw to avoid breaking any accidental prod calls
    console.warn('⚠️ loadTestSuite() is DEV-only and is disabled in production builds.');
    return {
      runP0Tests: undefined,
      testRedemptionFlow: undefined,
      setupTestEnvironment: undefined,
      auditTestEnvironment: undefined,
      simulateDevices: undefined,
      testHelpers: undefined,
    } as any;
  }

  console.log('🧪 ========================================');
  console.log('🧪 Loading P0 Test Suite...');
  console.log('🧪 ========================================\n');

  try {
    // ✅ DEV-only dynamic imports (tree-shaken from prod)
    const testRunner = await import('../../tests/p0-test-runner');
    console.log('✅ Test runner loaded');

    const testHelpers = await import('../../tests/test-helpers');
    console.log('✅ Test helpers loaded');

    const redemptionTests = await import('../../tests/test-redemption-flow');
    console.log('✅ Redemption flow tests loaded');

    const envSetup = await import('../../tests/setup-test-environment');
    console.log('✅ Environment setup loaded');

    const envAudit = await import('../../tests/audit-test-environment');
    console.log('✅ Environment audit loaded');

    const deviceSim = await import('../../tests/device-simulator');
    console.log('✅ Device simulator loaded');

    // Make available globally - FORCE the assignment
    const w = window as any;

    w.runP0Tests = testRunner.runP0Tests;
    w.testRedemptionFlow = redemptionTests.testRedemptionFlow;

    w.setupTestEnvironment = envSetup.setupTestEnvironment;
    w.resetTestEnvironment = envSetup.resetTestEnvironment;
    w.getTestEnvironment = envSetup.getTestEnvironment;
    w.printTestCredentials = envSetup.printTestCredentials;

    w.auditTestEnvironment = envAudit.auditTestEnvironment;

    w.simulateDevices = deviceSim.simulateDevices;
    w.switchToDevice = deviceSim.switchToDevice;
    w.showDeviceStatus = deviceSim.showDeviceStatus;
    w.resetDeviceSimulation = deviceSim.resetDeviceSimulation;
    w.testScenario_FreshKidLogin = deviceSim.testScenario_FreshKidLogin;
    w.testScenario_ParentApproval = deviceSim.testScenario_ParentApproval;
    w.testScenario_SessionConflict = deviceSim.testScenario_SessionConflict;

    w.testHelpers = w.testHelpers || {};
    // expose module exports too, in case helpers are referenced that way
    w.testHelpers.module = testHelpers;

    // Verify they were attached
    console.log('🔍 Verifying global functions...');
    console.log('   setupTestEnvironment:', typeof w.setupTestEnvironment);
    console.log('   auditTestEnvironment:', typeof w.auditTestEnvironment);
    console.log('   simulateDevices:', typeof w.simulateDevices);

    console.log('\n📝 Available Commands:\n');

    console.log('=== ENVIRONMENT SETUP ===');
    console.log('1. Setup test families:');
    console.log('   await setupTestEnvironment()\n');

    console.log('2. Audit test environment:');
    console.log('   await auditTestEnvironment()\n');

    console.log('3. Print test credentials:');
    console.log('   printTestCredentials()\n');

    console.log('=== DEVICE SIMULATION ===');
    console.log('4. Setup device simulation:');
    console.log('   await simulateDevices()\n');

    console.log('5. Switch devices:');
    console.log('   await switchToDevice("device1")  // Kid device');
    console.log('   await switchToDevice("device2")  // Parent device');
    console.log('   await switchToDevice("device3")  // Second kid device\n');

    console.log('6. Check device status:');
    console.log('   showDeviceStatus()\n');

    console.log('=== TESTING ===');
    console.log('7. Run full P0 test suite:');
    console.log('   await runP0Tests({ childId: "child:xxx", familyBId: "family:yyy" })\n');

    console.log('8. Test redemption flow:');
    console.log('   await testRedemptionFlow()\n');

    console.log('9. Run quick tests:');
    console.log('   await testHelpers.quickTest("child:xxx")\n');

    console.log('📚 Documentation:');
    console.log('   /TEST_EXECUTION_GUIDE.md - P0 test execution');
    console.log('   /REDEMPTION_FLOW_GUIDE.md - Redemption system');
    console.log('   /TEST_ENVIRONMENT_GUIDE.md - Environment setup\n');

    console.log('✅ Test suite ready!\n');

    return {
      runP0Tests: testRunner.runP0Tests,
      testRedemptionFlow: redemptionTests.testRedemptionFlow,
      setupTestEnvironment: envSetup.setupTestEnvironment,
      auditTestEnvironment: envAudit.auditTestEnvironment,
      simulateDevices: deviceSim.simulateDevices,
      testHelpers: w.testHelpers,
    };
  } catch (error) {
    console.error('❌ Failed to load test suite:', error);
    throw error;
  }
}

// ✅ Expose loader globally (safe in prod; it’s DEV-gated inside)
(window as any).loadTestSuite = loadTestSuite;

// ✅ Auto-load ONLY in DEV (never in prod builds)
if (import.meta.env.DEV) {
  loadTestSuite().catch((err) => {
    console.warn('⚠️ Test suite auto-load failed:', err);
    console.log('💡 Tip: Run loadTestSuite() manually to retry');
  });
}
