# Long-running helper for the Focussed Volume Stream Deck plugin. Reads one JSON command per line on
# stdin and answers "<id> ok <state json>" or "<id> err <message>" on stdout:
#   {"id":1,"cmd":"get"}                 volume of the focused window's app
#   {"id":2,"cmd":"adjust","delta":10}   change it by delta percentage points (unmutes when raising)
#   {"id":3,"cmd":"mute"}                toggle its mute
# The state is {"found":true,"app":"Spotify","volume":40,"muted":false}; found is false when the app
# has no audio session (it hasn't played sound since it started).
# It stays running so the C# below is compiled once, not on every key press. Run it with -MTA so
# COM objects can be released by the finalizer while this thread waits on stdin.

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorCo { }

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
}

[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection {
    int GetCount(out int count);
    int Item(int index, out IMMDevice device);
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
}

[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
    int GetAudioSessionControl(IntPtr sessionGuid, int flags, out IntPtr control);
    int GetSimpleAudioVolume(IntPtr sessionGuid, int flags, out IntPtr volume);
    int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
}

[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
    int GetCount(out int count);
    int GetSession(int index, out IAudioSessionControl2 session);
}

[ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
    int GetState(out int state);
    int GetDisplayName(out IntPtr name);
    int SetDisplayName(IntPtr name, IntPtr context);
    int GetIconPath(out IntPtr path);
    int SetIconPath(IntPtr path, IntPtr context);
    int GetGroupingParam(out Guid param);
    int SetGroupingParam(ref Guid param, IntPtr context);
    int RegisterAudioSessionNotification(IntPtr client);
    int UnregisterAudioSessionNotification(IntPtr client);
    int GetSessionIdentifier(out IntPtr id);
    int GetSessionInstanceIdentifier(out IntPtr id);
    int GetProcessId(out uint pid);
}

[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
    int SetMasterVolume(float level, ref Guid context);
    int GetMasterVolume(out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

public class VolumeState {
    public bool found { get; set; }
    public string app { get; set; }
    public int volume { get; set; }
    public bool muted { get; set; }
}

public static class FocusedVolume {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PROCESSENTRY32 {
        public uint dwSize; public uint cntUsage; public uint th32ProcessID; public IntPtr th32DefaultHeapID;
        public uint th32ModuleID; public uint cntThreads; public uint th32ParentProcessID; public int pcPriClassBase;
        public uint dwFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
    }
    delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc cb, IntPtr lParam);
    [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snap, ref PROCESSENTRY32 entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snap, ref PROCESSENTRY32 entry);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

    static Guid NoContext = Guid.Empty;
    static uint namePid;
    static string nameCache;

    class Proc { public uint parent; public string exe; }

    /// Every running process: pid -> parent pid and exe name.
    static Dictionary<uint, Proc> Processes() {
        var map = new Dictionary<uint, Proc>();
        IntPtr snap = CreateToolhelp32Snapshot(0x2, 0); // TH32CS_SNAPPROCESS
        if (snap == new IntPtr(-1)) return map;
        try {
            var e = new PROCESSENTRY32();
            e.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
            for (bool ok = Process32FirstW(snap, ref e); ok; ok = Process32NextW(snap, ref e)) {
                map[e.th32ProcessID] = new Proc { parent = e.th32ParentProcessID, exe = e.szExeFile };
            }
        } finally {
            CloseHandle(snap);
        }
        return map;
    }

    /// The process that owns the focused window. Store apps are hosted in ApplicationFrameHost,
    /// so for those it's the process of the child window that belongs to someone else.
    static uint FocusedPid(Dictionary<uint, Proc> procs) {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return 0;
        uint pid;
        GetWindowThreadProcessId(hwnd, out pid);
        Proc p;
        if (procs.TryGetValue(pid, out p) && string.Equals(p.exe, "ApplicationFrameHost.exe", StringComparison.OrdinalIgnoreCase)) {
            uint host = pid, inner = 0;
            EnumChildWindows(hwnd, (child, l) => {
                uint cp;
                GetWindowThreadProcessId(child, out cp);
                if (cp != host) { inner = cp; return false; }
                return true;
            }, IntPtr.Zero);
            if (inner != 0) pid = inner;
        }
        return pid;
    }

    /// True if `pid` belongs to the focused app: the same process, a descendant of it
    /// (e.g. a browser's audio process), or another process of the same program.
    static bool SameApp(uint pid, uint focused, Dictionary<uint, Proc> procs) {
        if (pid == focused) return true;
        Proc f, p;
        if (!procs.TryGetValue(focused, out f) || !procs.TryGetValue(pid, out p)) return false;
        if (string.Equals(p.exe, f.exe, StringComparison.OrdinalIgnoreCase)) return true;
        uint cur = pid;
        for (int depth = 0; depth < 16 && procs.TryGetValue(cur, out p) && p.parent != 0 && p.parent != cur; depth++) {
            if (p.parent == focused) return true;
            cur = p.parent;
        }
        return false;
    }

    /// The app's display name: its file description ("Google Chrome"), else its exe name.
    static string AppName(uint pid, Dictionary<uint, Proc> procs) {
        if (pid == namePid && nameCache != null) return nameCache;
        string name = null;
        try {
            string path = Process.GetProcessById((int)pid).MainModule.FileName;
            name = FileVersionInfo.GetVersionInfo(path).FileDescription;
        } catch (Exception) { }
        if (string.IsNullOrWhiteSpace(name)) {
            Proc p;
            name = procs.TryGetValue(pid, out p) ? System.IO.Path.GetFileNameWithoutExtension(p.exe) : "unknown";
        }
        namePid = pid;
        nameCache = name.Trim();
        return nameCache;
    }

    /// Volume controls of the focused app's audio sessions, on every active output device.
    static List<ISimpleAudioVolume> Sessions(out string app) {
        var procs = Processes();
        uint focused = FocusedPid(procs);
        app = focused == 0 ? "" : AppName(focused, procs);
        var result = new List<ISimpleAudioVolume>();
        if (focused == 0) return result;

        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCo();
        IMMDeviceCollection devices;
        Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(0, 1, out devices)); // eRender, ACTIVE
        int deviceCount;
        devices.GetCount(out deviceCount);
        Guid iid = typeof(IAudioSessionManager2).GUID;
        for (int d = 0; d < deviceCount; d++) {
            IMMDevice device;
            if (devices.Item(d, out device) != 0) continue;
            object o;
            if (device.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) continue; // CLSCTX_ALL
            IAudioSessionEnumerator sessions;
            if (((IAudioSessionManager2)o).GetSessionEnumerator(out sessions) != 0) continue;
            int count;
            sessions.GetCount(out count);
            for (int i = 0; i < count; i++) {
                IAudioSessionControl2 s;
                if (sessions.GetSession(i, out s) != 0) continue;
                int state;
                uint pid;
                if (s.GetState(out state) != 0 || state == 2) continue; // expired
                if (s.GetProcessId(out pid) != 0 || pid == 0) continue;  // 0 = system sounds
                if (SameApp(pid, focused, procs)) result.Add((ISimpleAudioVolume)s);
            }
        }
        return result;
    }

    static VolumeState Read(List<ISimpleAudioVolume> sessions, string app) {
        var st = new VolumeState { app = app, found = sessions.Count > 0, muted = sessions.Count > 0 };
        float max = 0;
        foreach (var s in sessions) {
            float level;
            bool mute;
            s.GetMasterVolume(out level);
            s.GetMute(out mute);
            if (level > max) max = level;
            if (!mute) st.muted = false;
        }
        st.volume = (int)Math.Round(max * 100);
        return st;
    }

    public static VolumeState Get() {
        string app;
        return Read(Sessions(out app), app);
    }

    public static VolumeState Adjust(int delta) {
        string app;
        var sessions = Sessions(out app);
        var st = Read(sessions, app);
        if (!st.found) return st;
        int target = Math.Max(0, Math.Min(100, st.volume + delta));
        foreach (var s in sessions) {
            s.SetMasterVolume(target / 100f, ref NoContext);
            if (delta > 0) s.SetMute(false, ref NoContext);
        }
        return Read(sessions, app);
    }

    public static VolumeState ToggleMute() {
        string app;
        var sessions = Sessions(out app);
        var st = Read(sessions, app);
        foreach (var s in sessions) s.SetMute(!st.muted, ref NoContext);
        return Read(sessions, app);
    }
}
'@

[Console]::Out.WriteLine('ready')
while ($null -ne ($line = [Console]::In.ReadLine())) {
    $id = 0
    try {
        $c = $line | ConvertFrom-Json
        $id = $c.id
        $state = switch ($c.cmd) {
            'get' { [FocusedVolume]::Get() }
            'adjust' { [FocusedVolume]::Adjust([int]$c.delta) }
            'mute' { [FocusedVolume]::ToggleMute() }
            default { throw "unknown command $($c.cmd)" }
        }
        [Console]::Out.WriteLine("$id ok $($state | ConvertTo-Json -Compress)")
    } catch {
        [Console]::Out.WriteLine("$id err $($_.Exception.Message -replace '\s+', ' ')")
    }
}
