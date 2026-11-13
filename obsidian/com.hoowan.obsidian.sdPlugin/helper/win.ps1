# Long-running helper for the Obsidian Stream Deck plugin. Reads one JSON command per line on
# stdin and answers "<id> ok" or "<id> err <message>" on stdout:
#   {"id":1,"cmd":"focus","exe":"C:\\...\\Obsidian.exe"}   launch Obsidian if needed, bring it to front
#   {"id":2,"cmd":"keys","keys":[162,164,37]}             press virtual-key codes together, release in reverse
#   {"id":3,"cmd":"uri","uri":"obsidian://daily?..."}      open a URI with its registered handler
# It stays running so the C# below is compiled once, not on every key press.

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
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

    [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
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

    /// Presses the keys in order and releases them in reverse, e.g. LCtrl+LAlt+Left.
    public static void Chord(ushort[] vks) {
        var inputs = new INPUT[vks.Length * 2];
        for (int k = 0; k < vks.Length; k++) {
            inputs[k] = Key(vks[k], false);
            inputs[vks.Length * 2 - 1 - k] = Key(vks[k], true);
        }
        SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    /// Brings a window to the front. Windows blocks background processes from doing this directly,
    /// so it first borrows the foreground thread's input state, then falls back to the Alt-key trick.
    /// Returns 0 if it was already in front, 1 if it was brought forward, -1 on failure.
    public static int Focus(IntPtr h) {
        if (IsIconic(h)) ShowWindow(h, 9); // SW_RESTORE
        if (GetForegroundWindow() == h) return 0;

        uint fg = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
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

function Get-ObsidianWindow {
    Get-Process -Name Obsidian -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
        Select-Object -First 1
}

function Invoke-Focus($exe) {
    $p = Get-ObsidianWindow
    if (-not $p) {
        Start-Process -FilePath $exe
        for ($i = 0; $i -lt 80 -and -not $p; $i++) {
            Start-Sleep -Milliseconds 250
            $p = Get-ObsidianWindow
        }
        if (-not $p) { throw 'Obsidian did not open' }
        Start-Sleep -Milliseconds 1500 # let the vault finish loading before sending keys
    }
    $r = [Win]::Focus($p.MainWindowHandle)
    if ($r -lt 0) { throw 'could not bring Obsidian to the front' }
    if ($r -gt 0) { Start-Sleep -Milliseconds 150 } # let it take keyboard focus
}

[Console]::Out.WriteLine('ready')
while ($null -ne ($line = [Console]::In.ReadLine())) {
    $id = 0
    try {
        $c = $line | ConvertFrom-Json
        $id = $c.id
        switch ($c.cmd) {
            'focus' { Invoke-Focus $c.exe }
            'keys' { [Win]::Chord([uint16[]]$c.keys) }
            'uri' { Start-Process -FilePath $c.uri }
            default { throw "unknown command $($c.cmd)" }
        }
        [Console]::Out.WriteLine("$id ok")
    } catch {
        [Console]::Out.WriteLine("$id err $($_.Exception.Message -replace '\s+', ' ')")
    }
}
