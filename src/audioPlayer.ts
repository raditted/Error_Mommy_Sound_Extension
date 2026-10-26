import * as cp from 'child_process';

// State

let currentProcess: cp.ChildProcess | null = null;

// Platform commands

interface PlayCommand {
  command: string;
  args: string[];
}

/** Build the platform-specific command to play an audio file. */
function buildPlayCommand(filePath: string): PlayCommand {
  switch (process.platform) {
    case 'darwin':
      return { command: 'afplay', args: [filePath] };

    case 'win32':
      return {
        command: 'powershell',
        args: ['-c', `(New-Object Media.SoundPlayer '${filePath}').PlaySync()`],
      };

    default:
      // Linux: try PulseAudio → ALSA → ffplay
      return {
        command: 'sh',
        args: [
          '-c',
          `paplay "${filePath}" || aplay "${filePath}" || ffplay -nodisp -autoexit "${filePath}"`,
        ],
      };
  }
}

// Public API

/** Kill any currently-playing audio process. */
export function stopCurrentAudio(): void {
  if (!currentProcess) {
    return;
  }
  try {
    currentProcess.kill('SIGKILL');
  } catch (err) {
    console.error('Mommy ASMR: Failed to kill audio process:', err);
  }
  currentProcess = null;
}

/**
 * Play an audio file using the platform's native player.
 * Automatically stops any previously playing audio first.
 */
export function playAudioFile(filePath: string): void {
  stopCurrentAudio();

  try {
    const { command, args } = buildPlayCommand(filePath);

    const proc = cp.spawn(command, args, {
      stdio: 'ignore',
      windowsHide: true,
    });

    currentProcess = proc;

    proc.on('exit', () => {
      if (currentProcess === proc) {
        currentProcess = null;
      }
    });

    proc.on('error', (err) => {
      console.error('Mommy ASMR: Error playing audio:', err);
      if (currentProcess === proc) {
        currentProcess = null;
      }
    });
  } catch (err) {
    console.error('Mommy ASMR: Failed to spawn audio process:', err);
  }
}
