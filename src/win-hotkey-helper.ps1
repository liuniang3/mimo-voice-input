param(
  [Parameter(Mandatory = $true)]
  [string]$ConfigJson
)

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class MimoHotKeyNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MSG {
    public IntPtr hwnd;
    public uint message;
    public UIntPtr wParam;
    public IntPtr lParam;
    public uint time;
    public POINT pt;
  }

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

  [DllImport("user32.dll")]
  public static extern sbyte GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
}
"@

function Write-EventLine([string]$Name, [string]$Label, [string]$Detail = "") {
  [Console]::Out.WriteLine(("{0}`t{1}`t{2}" -f $Name, $Label, $Detail))
  [Console]::Out.Flush()
}

$config = $ConfigJson | ConvertFrom-Json
$registeredIds = New-Object System.Collections.Generic.List[int]
$labelsById = @{}
$nextId = 100

try {
  foreach ($hotkey in $config.hotkeys) {
    $id = $nextId
    $nextId += 1
    $label = [string]$hotkey.label
    $modifiers = [uint32]$hotkey.modifiers
    $keyCode = [uint32]$hotkey.keyCode

    if ([MimoHotKeyNative]::RegisterHotKey([IntPtr]::Zero, $id, $modifiers, $keyCode)) {
      $registeredIds.Add($id)
      $labelsById[$id] = $label
      Write-EventLine "REGISTERED" $label
    } else {
      $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      Write-EventLine "FAILED" $label $errorCode
    }
  }

  while ($true) {
    $msg = New-Object MimoHotKeyNative+MSG
    $result = [MimoHotKeyNative]::GetMessage([ref]$msg, [IntPtr]::Zero, 0, 0)
    if ($result -eq 0 -or $result -eq -1) {
      break
    }
    if ($msg.message -eq 0x0312) {
      $id = [int]$msg.wParam.ToUInt32()
      if ($labelsById.ContainsKey($id)) {
        Write-EventLine "HOTKEY" $labelsById[$id]
      }
    }
  }
} finally {
  foreach ($id in $registeredIds) {
    [MimoHotKeyNative]::UnregisterHotKey([IntPtr]::Zero, $id) | Out-Null
  }
}
