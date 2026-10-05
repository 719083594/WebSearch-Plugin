// Backward-compatible diagnostic entry.
import {runCli} from '../cli.mjs'
process.exitCode=await runCli(['diagnose',...process.argv.slice(2)])
