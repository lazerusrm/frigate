import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import axios from 'axios';
import { useApiHost } from '@/api/index';
import { useSWRConfig } from 'swr';
import { toast } from 'react-toastify';
import { Switch, Input, Select, Button } from 'daisyui/react';  // Match Frigate UI components

export default function ChektSettings() {
  const { apiHost } = useApiHost();
  const { mutate } = useSWRConfig();
  const [config, setConfig] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [testCamera, setTestCamera] = useState('');

  useEffect(() => {
    // Fetch config
    axios.get(`${apiHost}/api/config`).then(res => {
      setConfig(res.data.chekt || {});
      setCameras(Object.keys(res.data.cameras || {}));
    });
  }, []);

  const saveConfig = async (updates) => {
    try {
      await axios.post(`${apiHost}/api/config/save`, updates);
      toast.success('Config saved, restarting...');
      mutate(`${apiHost}/api/config`);
    } catch (e) {
      toast.error('Failed to save');
    }
  };

  const handleTest = async () => {
    if (!testCamera) return toast.error('Select a camera');
    try {
      const res = await axios.post(`${apiHost}/api/chekt/test?camera=${testCamera}`);
      if (res.data.success) toast.success('Test successful');
    } catch (e) {
      toast.error(`Test failed: ${e.message}`);
    }
  };

  if (!config) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <Switch
          checked={config.enabled}
          onChange={(e) => saveConfig({ chekt: { ...config, enabled: e.target.checked } })}
        />
        <span className="ml-2">Enable Chekt</span>
      </div>
      <Input
        label="Host"
        value={config.host || ''}
        onChange={(e) => setConfig({ ...config, host: e.target.value })}
      />
      <Input
        label="Port"
        type="number"
        value={config.port || 80}
        onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })}
      />
      <Input
        label="Token"
        value={config.token || ''}
        onChange={(e) => setConfig({ ...config, token: e.target.value })}
      />
      <Button onClick={() => saveConfig({ chekt: config })}>Save Global Settings</Button>

      <h3>Cameras</h3>
      {cameras.map(cam => (
        <div key={cam} className="border p-2">
          <h4>{cam}</h4>
          <Input
            label="Channel Number"
            value={config.cameras?.[cam]?.chekt?.chan_num || ''}
            onChange={(e) => saveConfig({ cameras: { [cam]: { chekt: { chan_num: e.target.value } } } })}
          />
          <div className="flex items-center">
            <Switch
              checked={config.cameras?.[cam]?.chekt?.draw_bounding_boxes ?? true}
              onChange={(e) => saveConfig({ cameras: { [cam]: { chekt: { draw_bounding_boxes: e.target.checked } } } })}
            />
            <span className="ml-2">Draw Bounding Boxes</span>
          </div>
        </div>
      ))}

      <div>
        <Select
          value={testCamera}
          onChange={(e) => setTestCamera(e.target.value)}
          options={cameras.map(c => ({ value: c, label: c }))}
        />
        <Button onClick={handleTest}>Test Connection</Button>
      </div>
    </div>
  );
}