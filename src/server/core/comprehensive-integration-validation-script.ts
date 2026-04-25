#!/usr/bin/env node

/**
 * Comprehensive Integration Validation Script
 * 
 * Task 15.1: Validates that all performance optimizations work together
 * 
 * This script validates:
 * - Bootstrap batching integration with parallel guess processing
 * - Paginated leaderboards integration with optimized rendering
 * - Server optimizations integration with client improvements
 * - Performance targets are met across all systems
 */

import {
  comprehensivePerformanceIntegration,
  validateComprehensiveIntegration,
  verifyPerformanceTargets,
  getComprehensiveStatus,
  getComprehensiveMetrics,
} from './comprehensive-performance-integration';

/**
 * Performance targets from requirements
 */
const PERFORMANCE_TARGETS = {
  bootstrap: { improvement: 0.5, description: '50% bootstrap time reduction' },
  guessProcessing: { improvement: 0.6, description: '60% guess processing improvement' },
  leaderboard: { improvement: 0.7, description: '70% leaderboard bandwidth reduction' },
  rendering: { improvement: 0.8, description: '80% render cycle reduction' },
};

/**
 * Validation categories
 */
interface ValidationCategory {
  name: string;
  tests: ValidationTest[];
}

interface ValidationTest {
  name: string;
  test: () => Promise<{ success: boolean; message: string; details?: any }>;
}

/**
 * Main validation function
 */
async function runComprehensiveValidation(): Promise<void> {
  console.log('🚀 Starting Comprehensive Performance Integration Validation\n');
  console.log('=' .repeat(80));
  console.log('Task 15.1: Wire all performance optimizations together');
  console.log('=' .repeat(80));
  console.log();

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const issues: string[] = [];
  const recommendations: string[] = [];

  try {
    // Initialize comprehensive integration
    console.log('📋 Initializing Comprehensive Integration...');
    await comprehensivePerformanceIntegration.initialize();
    console.log('✅ Comprehensive integration initialized\n');

    // Define validation categories
    const categories: ValidationCategory[] = [
      {
        name: 'System Integration',
        tests: [
          {
            name: 'Bootstrap-Guess Processing Coordination',
            test: testBootstrapGuessCoordination,
          },
          {
            name: 'Leaderboard-Rendering Coordination',
            test: testLeaderboardRenderingCoordination,
          },
          {
            name: 'Server-Client Coordination',
            test: testServerClientCoordination,
          },
        ],
      },
      {
        name: 'Performance Targets',
        tests: [
          {
            name: 'Bootstrap Performance Target (50%)',
            test: testBootstrapPerformanceTarget,
          },
          {
            name: 'Guess Processing Performance Target (60%)',
            test: testGuessProcessingPerformanceTarget,
          },
          {
            name: 'Leaderboard Performance Target (70%)',
            test: testLeaderboardPerformanceTarget,
          },
          {
            name: 'Rendering Performance Target (80%)',
            test: testRenderingPerformanceTarget,
          },
        ],
      },
      {
        name: 'Integration Validation',
        tests: [
          {
            name: 'Comprehensive Integration Status',
            test: testIntegrationStatus,
          },
          {
            name: 'Cross-System Optimization Coordination',
            test: testCrossSystemCoordination,
          },
          {
            name: 'Performance Monitoring Integration',
            test: testPerformanceMonitoring,
          },
        ],
      },
      {
        name: 'Backward Compatibility',
        tests: [
          {
            name: 'Fallback Mechanisms',
            test: testFallbackMechanisms,
          },
          {
            name: 'Configuration Flexibility',
            test: testConfigurationFlexibility,
          },
        ],
      },
    ];

    // Run validation categories
    for (const category of categories) {
      console.log(`📂 ${category.name}`);
      console.log('-'.repeat(40));

      for (const test of category.tests) {
        totalTests++;
        
        try {
          const result = await test.test();
          
          if (result.success) {
            console.log(`   ✅ ${test.name}: ${result.message}`);
            passedTests++;
          } else {
            console.log(`   ❌ ${test.name}: ${result.message}`);
            failedTests++;
            issues.push(`${category.name} - ${test.name}: ${result.message}`);
          }
          
          if (result.details) {
            console.log(`      Details: ${JSON.stringify(result.details, null, 2)}`);
          }
        } catch (error) {
          console.log(`   ❌ ${test.name}: Test failed with error: ${error}`);
          failedTests++;
          issues.push(`${category.name} - ${test.name}: Test error: ${error}`);
        }
      }
      
      console.log();
    }

    // Run comprehensive validation
    console.log('🔍 Running Comprehensive Validation...');
    const validationResult = await validateComprehensiveIntegration();
    
    if (validationResult.success) {
      console.log(`✅ Comprehensive validation passed (Score: ${validationResult.score.toFixed(1)}/100)`);
    } else {
      console.log(`❌ Comprehensive validation failed (Score: ${validationResult.score.toFixed(1)}/100)`);
      issues.push(...validationResult.issues);
    }
    
    recommendations.push(...validationResult.recommendations);
    console.log();

    // Verify performance targets
    console.log('🎯 Verifying Performance Targets...');
    const targetResult = await verifyPerformanceTargets();
    
    if (targetResult.targetsMet) {
      console.log('✅ All performance targets met');
    } else {
      console.log('❌ Some performance targets not met');
      recommendations.push(...targetResult.recommendations);
    }
    
    // Display performance improvements
    console.log('\n📊 Performance Improvements:');
    console.log(`   Bootstrap: ${(targetResult.improvements.bootstrapImprovement * 100).toFixed(1)}% (Target: 50%)`);
    console.log(`   Guess Processing: ${(targetResult.improvements.guessProcessingImprovement * 100).toFixed(1)}% (Target: 60%)`);
    console.log(`   Leaderboard: ${(targetResult.improvements.leaderboardBandwidthReduction * 100).toFixed(1)}% (Target: 70%)`);
    console.log(`   Rendering: ${(targetResult.improvements.renderCycleReduction * 100).toFixed(1)}% (Target: 80%)`);
    console.log();

    // Display comprehensive metrics
    console.log('📈 Comprehensive Metrics:');
    const metrics = getComprehensiveMetrics();
    console.log(`   Server Optimizations: ${metrics.server ? 'Active' : 'Inactive'}`);
    console.log(`   Client Optimizations: ${metrics.client ? 'Active' : 'Inactive'}`);
    console.log(`   Integration Score: ${metrics.validation.score}/100`);
    console.log(`   Targets Met: ${metrics.validation.targetsMet ? 'Yes' : 'No'}`);
    console.log();

  } catch (error) {
    console.error('❌ Validation failed with error:', error);
    issues.push(`Validation error: ${error}`);
    failedTests++;
  }

  // Display summary
  console.log('=' .repeat(80));
  console.log('📋 VALIDATION SUMMARY');
  console.log('=' .repeat(80));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Success Rate: ${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0}%`);
  console.log();

  if (issues.length > 0) {
    console.log('❌ ISSUES FOUND:');
    issues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue}`);
    });
    console.log();
  }

  if (recommendations.length > 0) {
    console.log('💡 RECOMMENDATIONS:');
    recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec}`);
    });
    console.log();
  }

  const overallSuccess = failedTests === 0 && issues.length === 0;
  
  if (overallSuccess) {
    console.log('🎉 ALL VALIDATIONS PASSED! Comprehensive integration is working correctly.');
  } else {
    console.log('⚠️  Some validations failed. Please review the issues and recommendations above.');
  }

  console.log('=' .repeat(80));
  
  // Exit with appropriate code
  process.exit(overallSuccess ? 0 : 1);
}

/**
 * Individual test functions
 */

async function testBootstrapGuessCoordination(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const status = getComprehensiveStatus();
    
    if (!status.crossSystemCoordinationActive) {
      return {
        success: false,
        message: 'Cross-system coordination is not active',
      };
    }

    // Check if bootstrap batching and parallel guess processing are both enabled
    const activeOptimizations = status.activeOptimizations;
    const hasBootstrap = activeOptimizations.includes('Bootstrap Batching');
    const hasGuessProcessing = activeOptimizations.includes('Parallel Guess Processing');
    
    if (!hasBootstrap || !hasGuessProcessing) {
      return {
        success: false,
        message: `Missing optimizations - Bootstrap: ${hasBootstrap}, Guess Processing: ${hasGuessProcessing}`,
      };
    }

    return {
      success: true,
      message: 'Bootstrap and guess processing are coordinated',
      details: { activeOptimizations },
    };
  } catch (error) {
    return {
      success: false,
      message: `Coordination test failed: ${error}`,
    };
  }
}

async function testLeaderboardRenderingCoordination(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const status = getComprehensiveStatus();
    const activeOptimizations = status.activeOptimizations;
    
    const hasLeaderboard = activeOptimizations.includes('Leaderboard Pagination');
    const hasRendering = activeOptimizations.includes('Render Optimization');
    
    if (!hasLeaderboard || !hasRendering) {
      return {
        success: false,
        message: `Missing optimizations - Leaderboard: ${hasLeaderboard}, Rendering: ${hasRendering}`,
      };
    }

    return {
      success: true,
      message: 'Leaderboard pagination and rendering optimization are coordinated',
      details: { hasLeaderboard, hasRendering },
    };
  } catch (error) {
    return {
      success: false,
      message: `Coordination test failed: ${error}`,
    };
  }
}

async function testServerClientCoordination(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const status = getComprehensiveStatus();
    
    const serverActive = status.serverOptimizationsActive;
    const clientActive = status.clientOptimizationsActive;
    
    // Client optimizations may not be active in server context
    if (!serverActive) {
      return {
        success: false,
        message: 'Server optimizations are not active',
      };
    }

    return {
      success: true,
      message: `Server-client coordination active (Server: ${serverActive}, Client: ${clientActive})`,
      details: { serverActive, clientActive },
    };
  } catch (error) {
    return {
      success: false,
      message: `Server-client coordination test failed: ${error}`,
    };
  }
}

async function testBootstrapPerformanceTarget(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const targetResult = await verifyPerformanceTargets();
    const improvement = targetResult.improvements.bootstrapImprovement;
    const target = PERFORMANCE_TARGETS.bootstrap.improvement;
    
    const success = improvement >= target;
    
    return {
      success,
      message: success 
        ? `Bootstrap improvement (${(improvement * 100).toFixed(1)}%) meets target (${(target * 100)}%)`
        : `Bootstrap improvement (${(improvement * 100).toFixed(1)}%) below target (${(target * 100)}%)`,
      details: { improvement, target },
    };
  } catch (error) {
    return {
      success: false,
      message: `Bootstrap performance test failed: ${error}`,
    };
  }
}

async function testGuessProcessingPerformanceTarget(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const targetResult = await verifyPerformanceTargets();
    const improvement = targetResult.improvements.guessProcessingImprovement;
    const target = PERFORMANCE_TARGETS.guessProcessing.improvement;
    
    const success = improvement >= target;
    
    return {
      success,
      message: success 
        ? `Guess processing improvement (${(improvement * 100).toFixed(1)}%) meets target (${(target * 100)}%)`
        : `Guess processing improvement (${(improvement * 100).toFixed(1)}%) below target (${(target * 100)}%)`,
      details: { improvement, target },
    };
  } catch (error) {
    return {
      success: false,
      message: `Guess processing performance test failed: ${error}`,
    };
  }
}

async function testLeaderboardPerformanceTarget(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const targetResult = await verifyPerformanceTargets();
    const improvement = targetResult.improvements.leaderboardBandwidthReduction;
    const target = PERFORMANCE_TARGETS.leaderboard.improvement;
    
    const success = improvement >= target;
    
    return {
      success,
      message: success 
        ? `Leaderboard improvement (${(improvement * 100).toFixed(1)}%) meets target (${(target * 100)}%)`
        : `Leaderboard improvement (${(improvement * 100).toFixed(1)}%) below target (${(target * 100)}%)`,
      details: { improvement, target },
    };
  } catch (error) {
    return {
      success: false,
      message: `Leaderboard performance test failed: ${error}`,
    };
  }
}

async function testRenderingPerformanceTarget(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const targetResult = await verifyPerformanceTargets();
    const improvement = targetResult.improvements.renderCycleReduction;
    const target = PERFORMANCE_TARGETS.rendering.improvement;
    
    const success = improvement >= target;
    
    return {
      success,
      message: success 
        ? `Rendering improvement (${(improvement * 100).toFixed(1)}%) meets target (${(target * 100)}%)`
        : `Rendering improvement (${(improvement * 100).toFixed(1)}%) below target (${(target * 100)}%)`,
      details: { improvement, target },
    };
  } catch (error) {
    return {
      success: false,
      message: `Rendering performance test failed: ${error}`,
    };
  }
}

async function testIntegrationStatus(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const status = getComprehensiveStatus();
    
    if (!status.initialized) {
      return {
        success: false,
        message: 'Comprehensive integration is not initialized',
      };
    }

    const activeCount = status.activeOptimizations.length;
    
    return {
      success: true,
      message: `Integration active with ${activeCount} optimizations`,
      details: { 
        initialized: status.initialized,
        activeOptimizations: status.activeOptimizations,
        performanceTargetsMet: status.performanceTargetsMet,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Integration status test failed: ${error}`,
    };
  }
}

async function testCrossSystemCoordination(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const status = getComprehensiveStatus();
    
    const success = status.crossSystemCoordinationActive;
    
    return {
      success,
      message: success 
        ? 'Cross-system coordination is active'
        : 'Cross-system coordination is not active',
      details: { 
        crossSystemCoordinationActive: status.crossSystemCoordinationActive,
        serverOptimizationsActive: status.serverOptimizationsActive,
        clientOptimizationsActive: status.clientOptimizationsActive,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Cross-system coordination test failed: ${error}`,
    };
  }
}

async function testPerformanceMonitoring(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const metrics = getComprehensiveMetrics();
    
    const hasServerMetrics = !!metrics.server;
    const hasValidationMetrics = !!metrics.validation;
    
    const success = hasServerMetrics && hasValidationMetrics;
    
    return {
      success,
      message: success 
        ? 'Performance monitoring is active'
        : 'Performance monitoring is incomplete',
      details: { 
        hasServerMetrics,
        hasValidationMetrics,
        lastValidation: metrics.validation?.lastRun,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Performance monitoring test failed: ${error}`,
    };
  }
}

async function testFallbackMechanisms(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const config = comprehensivePerformanceIntegration.getConfig();
    
    const hasFallbacks = config.enableFallbackMechanisms;
    
    return {
      success: hasFallbacks,
      message: hasFallbacks 
        ? 'Fallback mechanisms are enabled'
        : 'Fallback mechanisms are disabled',
      details: { enableFallbackMechanisms: hasFallbacks },
    };
  } catch (error) {
    return {
      success: false,
      message: `Fallback mechanisms test failed: ${error}`,
    };
  }
}

async function testConfigurationFlexibility(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const originalConfig = comprehensivePerformanceIntegration.getConfig();
    
    // Test configuration update
    comprehensivePerformanceIntegration.updateConfig({
      enableBootstrapBatching: !originalConfig.enableBootstrapBatching,
    });
    
    const updatedConfig = comprehensivePerformanceIntegration.getConfig();
    const configChanged = updatedConfig.enableBootstrapBatching !== originalConfig.enableBootstrapBatching;
    
    // Restore original configuration
    comprehensivePerformanceIntegration.updateConfig(originalConfig);
    
    return {
      success: configChanged,
      message: configChanged 
        ? 'Configuration is flexible and updatable'
        : 'Configuration update failed',
      details: { configChanged },
    };
  } catch (error) {
    return {
      success: false,
      message: `Configuration flexibility test failed: ${error}`,
    };
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  runComprehensiveValidation().catch(error => {
    console.error('❌ Validation script failed:', error);
    process.exit(1);
  });
}

export { runComprehensiveValidation };