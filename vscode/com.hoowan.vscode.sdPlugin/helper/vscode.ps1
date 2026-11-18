# Long-running helper for the VS Code Stream Deck plugin. Reads one JSON command per line on stdin
# and answers "<id> ok" or "<id> err <message>" on stdout:
#   {"id":1,"cmd":"focus"}              make sure a VS Code window is in front: the focused one if it
#                                       is VS Code, otherwise the most recently used VS Code window
#   {"id":2,"cmd":"keys","keys":[162,66]} press virtual-key codes together, release in reverse
#   {"id":3,"cmd":"newWindow"}          open a new, empty VS Code window and bring it to the front
# It stays running so the C# below is compiled once, not on every key press.

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

public static class Win {
    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public InputUnion u; }
    delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint attach, uint to, bool on);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    const uint INPUT_KEYBOARD = 1, KEYUP = 0x2, EXTENDED = 0x1;

    static bool IsExtended(ushort vk) {
        // Arrows, Insert/Delete, Home/End, PgUp/PgDn, right-hand Ctrl/Alt.
        return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0xA3 || vk == 0xA5;
    }

    static INPUT Key(ushort vk, bool up) {
        var i = new INPUT { type = INPUT_KEYBOARD };
        i.u.ki.wVk = vk;
        i.u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
        i.u.ki.dwFlags = (up ? KEYUP : 0) | (IsExtended(vk) ? EXTENDED : 0);
        return i;
    }

    /// Presses the keys in order and releases them in reverse, e.g. LCtrl+LAlt+B.
    public static void Chord(ushort[] vks) {
        var inputs = new INPUT[vks.Length * 2];
        for (int k = 0; k < vks.Length; k++) {
            inputs[k] = Key(vks[k], false);
            inputs[vks.Length * 2 - 1 - k] = Key(vks[k], true);
        }
        SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public static IntPtr Foreground() { return GetForegroundWindow(); }

    public static uint ProcessOf(IntPtr h) {
        uint pid;
        GetWindowThreadProcessId(h, out pid);
        return pid;
    }

    /// Visible, titled, unowned top-level windows of the given processes, front-most first.
    public static IntPtr[] MainWindows(uint[] pids) {
        var set = new HashSet<uint>(pids);
        var list = new List<IntPtr>();
        EnumWindows((h, l) => {
            if (IsWindowVisible(h) && GetWindow(h, 4) == IntPtr.Zero && GetWindowTextLength(h) > 0 && set.Contains(ProcessOf(h))) {
                list.Add(h);
            }
            return true;
        }, IntPtr.Zero);
        return list.ToArray();
    }

    /// Brings a window to the front. Windows blocks background processes from doing this directly,
    /// so it first borrows the foreground thread's input state, then falls back to the Alt-key trick.
    /// Returns 0 if it was already in front, 1 if it was brought forward, -1 on failure.
    public static int Focus(IntPtr h) {
        if (IsIconic(h)) ShowWindow(h, 9); // SW_RESTORE
        if (GetForegroundWindow() == h) return 0;

        uint unusedPid;
        uint fg = GetWindowThreadProcessId(GetForegroundWindow(), out unusedPid); // foreground thread
        uint me = GetCurrentThreadId();
        bool attached = fg != 0 && fg != me && AttachThreadInput(me, fg, true);
        BringWindowToTop(h);
        SetForegroundWindow(h);
        if (attached) AttachThreadInput(me, fg, false);

        if (GetForegroundWindow() != h) {
            keybd_event(0x12, 0, 0, UIntPtr.Zero);     // Alt down
            keybd_event(0x12, 0, KEYUP, UIntPtr.Zero); // Alt up
            SetForegroundWindow(h);
        }
        for (int t = 0; t < 20 && GetForegroundWindow() != h; t++) Thread.Sleep(25);
        return GetForegroundWindow() == h ? 1 : -1;
    }
}
'@

function Get-CodeProcesses { @(Get-Process -Name Code -ErrorAction SilentlyContinue) }

function Get-CodeWindows {
    $pids = [uint32[]]@(Get-CodeProcesses | ForEach-Object { $_.Id })
    if ($pids.Count -eq 0) { return @() }
    @([Win]::MainWindows($pids))
}

# The focused window if it's VS Code, else the front-most VS Code window, brought to the front.
function Invoke-Focus {
    $fg = [Win]::Foreground()
    $windows = Get-CodeWindows
    if ($windows -contains $fg) { return }
    if ($windows.Count -eq 0) { throw "VS Code isn't open" }
    $r = [Win]::Focus($windows[0])
    if ($r -lt 0) { throw 'could not bring VS Code to the front' }
    Start-Sleep -Milliseconds 150 # let it take keyboard focus
}

# Opens a new, empty window of the running VS Code (or the default install) and waits until it's
# in front and has loaded far enough to take keyboard shortcuts.
function Invoke-NewWindow {
    $exe = Get-CodeProcesses | ForEach-Object { $_.Path } | Where-Object { $_ } | Select-Object -First 1
    if (-not $exe) { $exe = Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe' }
    if (-not (Test-Path $exe)) { throw 'VS Code not found' }
    $before = Get-CodeWindows
    Start-Process -FilePath $exe -ArgumentList '--new-window'
    $new = $null
    for ($i = 0; $i -lt 80 -and -not $new; $i++) {
        Start-Sleep -Milliseconds 250
        $new = Get-CodeWindows | Where-Object { $before -notcontains $_ } | Select-Object -First 1
    }
    if (-not $new) { throw 'the new VS Code window did not open' }
    Start-Sleep -Milliseconds 1500 # the workbench ignores shortcuts until it has loaded
    if ([Win]::Focus($new) -lt 0) { throw 'could not bring the new window to the front' }
    Start-Sleep -Milliseconds 150
}

[Console]::Out.WriteLine('ready')
while ($null -ne ($line = [Console]::In.ReadLine())) {
    $id = 0
    try {
        $c = $line | ConvertFrom-Json
        $id = $c.id
        switch ($c.cmd) {
            'focus' { Invoke-Focus }
            'keys' { [Win]::Chord([uint16[]]$c.keys) }
            'newWindow' { Invoke-NewWindow }
            default { throw "unknown command $($c.cmd)" }
        }
        [Console]::Out.WriteLine("$id ok")
    } catch {
        [Console]::Out.WriteLine("$id err $($_.Exception.Message -replace '\s+', ' ')")
    }
}
